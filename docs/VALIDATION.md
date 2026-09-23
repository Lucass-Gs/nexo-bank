# Evidências de validação

Validação local em 22/09/2026, Windows, Docker Desktop/WSL2, Node.js 24 e Microsoft Edge via Playwright.

- Compilação TypeScript e build frontend executados.
- Testes unitários executados.
- Integração contra serviços reais no Docker, sem mock de PostgreSQL.
- Jornada de navegador e verificação de overflow em 1440 e 390 px. Isso não substitui auditoria completa de acessibilidade.

5 testes de integração: sessão/origem, autorização/idempotência/partidas/projeção, saga com timeout/recusa e concorrência de saldo. E2E executa transferência e reconciliação. Resiliência cobre consumidor indisponível, evento duplicado e reinício do ledger.

Consulte os testes e o resultado mais recente em [Actions](https://github.com/Lucass-Gs/nexo-bank/actions). Não foram medidos throughput, p95, disponibilidade ou cobertura percentual. Não há alegação de validação em produção.
