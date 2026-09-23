# Kubernetes local com kind

Este perfil cria um cluster de demonstração de um nó. Requer Docker, kind e kubectl no PATH. Os dados do cluster são independentes dos volumes do Compose. Reserve memória para seis serviços Node, seis bancos e Kafka; em uma máquina de 16 GB é útil parar outros projetos durante a demonstração.

## Criar, carregar imagens e iniciar

Execute na raiz do repositório. O kubeconfig fica separado da configuração pessoal e é ignorado pelo Git.

```sh
docker build --target api -t nexo-bank-api:dev .
docker build -f Dockerfile.web -t nexo-bank-web:dev .
kind create cluster --name nexo-bank --config infra/kind.yaml --kubeconfig .kubeconfig.local
kind load docker-image nexo-bank-api:dev nexo-bank-web:dev --name nexo-bank
kubectl --kubeconfig .kubeconfig.local apply -f infra/k8s/resources.json
kubectl --kubeconfig .kubeconfig.local -n nexo-bank wait --for=condition=Ready pod --all --timeout=300s
kubectl --kubeconfig .kubeconfig.local apply -f infra/k8s/seed.json
kubectl --kubeconfig .kubeconfig.local -n nexo-bank wait --for=condition=complete job/demo-seed --timeout=120s
```

Abra http://localhost:4105. As contas e senhas são as mesmas do README. O Secret versionado contém apenas valores sintéticos do laboratório, não credenciais de infraestrutura externa.

No primeiro boot, initContainers podem reiniciar enquanto bancos terminam de inicializar. Aguarde a condição Ready e consulte logs se persistir. O Kafka combinado broker/controller usa localhost:9093 para o quorum de um único nó; o tráfego dos clientes usa o Service kafka:9092.

## Verificar

```sh
kubectl --kubeconfig .kubeconfig.local -n nexo-bank get pods,pvc
kubectl --kubeconfig .kubeconfig.local -n nexo-bank logs deployment/transfers --tail=50
```

Para integração e navegador contra Kubernetes, configure BASE_URL=http://localhost:4105 antes de executar npm run test:integration e npm run test:e2e. No PowerShell: `$env:BASE_URL='http://localhost:4105'`.

## Recuperação de processo

Em um terminal, acompanhe `kubectl --kubeconfig .kubeconfig.local -n nexo-bank get pods -w`. Em outro, execute:

```sh
kubectl --kubeconfig .kubeconfig.local -n nexo-bank delete pod -l app=ledger
kubectl --kubeconfig .kubeconfig.local -n nexo-bank rollout status deployment/ledger --timeout=120s
```

Repita uma transferência com a mesma chave de idempotência e execute a reconciliação. A réplica única pode gerar indisponibilidade temporária durante substituição; recuperação de pod não equivale a alta disponibilidade. O PostgreSQL permanece em StatefulSet com PVC.

## Limites

Os manifests incluem requests/limits, probes, initContainers de migration, PVCs, containers de aplicação sem root e token de ServiceAccount desabilitado. Não incluem autoscaling, NetworkPolicy, TLS, observabilidade no cluster nem replicação dos bancos/broker. O perfil Jaeger é do Compose. Excluir o cluster com kind delete cluster --name nexo-bank também elimina seus dados locais; faça isso somente para um reset intencional.
