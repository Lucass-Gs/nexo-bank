# Operação local

## Inspeção

```sh
docker compose ps
docker compose logs --tail=100 api
docker compose logs --tail=100 web
```

GET /api/health verifica a conexão da API com seu banco. Um endpoint saudável não garante que todos os workers estejam processando eventos. Examine os logs do worker/consumidor e o estado do domínio. Nunca publique cookies, tokens ou dados pessoais coletados em diagnóstico.

## Parar e retomar

```sh
docker compose stop
docker compose up -d --wait
```

Volumes preservam dados. docker compose down remove containers/rede; down -v também apaga os dados de demonstração, portanto só use para um reset intencional. Execute o seed novamente após reset.

## Erro no primeiro boot

Verifique Docker em execução, porta 4104 livre, download das imagens e serviço de migration. Bancos usam credenciais definidas no primeiro boot do volume. Não edite uma migration já aplicada: adicione outra.

## API

Login: POST /api/auth/login com email/password; a resposta fornece csrf e Set-Cookie. GET /api/auth/me recupera usuário e token. Envie cookie e X-CSRF-Token em POST/PATCH/DELETE autenticados. Use Origin correspondente ao endereço aberto no navegador. Há validação de payload e respostas 401/403/404/409 conforme o caso. Os testes em tests/integration são exemplos executáveis de chamadas.

## Recuperação

Pare statements para observar o extrato atrasar enquanto o ledger continua. Retome para consumir o backlog. Reinicie ledger e repita uma transferência com a mesma chave. Para saga externa, timeout significa consultar a contraparte, nunca devolver saldo por suposição. Rode test:resilience para verificar esse comportamento automaticamente.

## Traces

Execute docker compose -f compose.yaml -f compose.observability.yaml up -d --wait. Abra http://localhost:16686 após gerar uma transferência. O Jaeger recebe spans OpenTelemetry dos serviços; seu armazenamento local é volátil. Não há métricas Prometheus nesta versão.
