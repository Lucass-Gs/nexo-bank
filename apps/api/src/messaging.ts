import { Kafka, logLevel } from "kafkajs";
import { Db } from "./db";
export const kafka = () =>
  new Kafka({
    clientId: process.env.SERVICE_NAME || "nexo",
    brokers: [process.env.KAFKA_BROKER || "kafka:9092"],
    logLevel: logLevel.WARN,
    retry: { retries: 10 },
  });
export async function relay(db: Db) {
  const k = kafka(),
    admin = k.admin();
  await admin.connect();
  await admin.createTopics({
    topics: [
      { topic: "ledger.journals.v1", numPartitions: 3, replicationFactor: 1 },
    ],
    waitForLeaders: true,
  });
  await admin.disconnect();
  const producer = k.producer();
  await producer.connect();
  let running = true;
  process.on("SIGTERM", () => {
    running = false;
  });
  while (running) {
    try {
      await db.tx(async (c) => {
        const events = (
          await c.query(
            "SELECT * FROM outbox WHERE published_at IS NULL ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 20",
          )
        ).rows;
        for (const e of events) {
          await producer.send({
            topic: "ledger.journals.v1",
            messages: [
              {
                key: e.payload.journalId,
                value: JSON.stringify({
                  eventId: e.id,
                  type: "ledger.journal.posted",
                  version: 1,
                  ...e.payload,
                }),
              },
            ],
          });
          await c.query("UPDATE outbox SET published_at=now() WHERE id=$1", [
            e.id,
          ]);
        }
      });
    } catch (e) {
      console.error("outbox", e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  await producer.disconnect();
}
export async function consume(db: Db, notifications = false) {
  const k = kafka(),
    consumer = k.consumer({
      groupId:
        process.env.CONSUMER_GROUP ||
        (notifications ? "nexo-notifications-v1" : "nexo-statements-v1"),
    });
  await consumer.connect();
  await consumer.subscribe({
    topic: "ledger.journals.v1",
    fromBeginning: true,
  });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value!.toString());
      await db.tx(async (c) => {
        if (
          !(
            await c.query(
              "INSERT INTO inbox(event_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING event_id",
              [event.eventId],
            )
          ).rowCount
        )
          return;
        if (notifications)
          await c.query(
            "INSERT INTO notifications(event_id,body) VALUES($1,$2)",
            [event.eventId, "Notificação simulada: " + event.journalId],
          );
        else
          for (const e of event.entries)
            await c.query(
              "INSERT INTO statements VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
              [
                e.id,
                e.account_id,
                e.owner_id,
                event.journalId,
                e.amount,
                event.description,
                event.createdAt,
              ],
            );
      });
    },
  });
}
