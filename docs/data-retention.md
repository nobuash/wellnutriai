# Retenção e exclusão de dados

## O que é coletado

| Dado | Tabela | Onde |
|---|---|---|
| Perfil (nome, e-mail, plano) | `profiles` | cadastro |
| Questionário nutricional (idade, peso, condições) | `nutrition_questionnaires` | questionário |
| Planos alimentares gerados | `meal_plans` | geração de plano |
| Histórico de chat | `chat_messages` | chat |
| Fotos de refeição + análise | `meal_photo_analysis` + Storage `meal-photos/{user_id}/` | análise por foto |
| Registros de água | `water_logs` | hidratação |
| Registros de calorias | `calorie_logs` | análise de refeição |
| Assinatura/pagamento | `subscriptions` | pagamento |
| Consentimento de termos | `user_consents` (versão, IP com hash, user agent) | aceite de termos |
| Uso/custo de IA | `ai_usage_logs` (tokens e custo estimado — nunca o conteúdo do prompt) | toda chamada de IA |

## Exclusão de conta

`POST /api/account/delete` (UI em `/account`):

1. Confirma a senha atual do usuário.
2. Cancela assinatura Stripe recorrente ativa, se houver (best-effort).
3. Apaga os objetos do Storage em `meal-photos/{user_id}/`.
4. Grava um `audit_log` com a ação `account_deleted`.
5. Chama `service.auth.admin.deleteUser(userId)`.

O passo 5 dispara `ON DELETE CASCADE` do Postgres em toda tabela com FK
para `auth.users`, o que já cobre `profiles`, `nutrition_questionnaires`,
`meal_plans`, `chat_messages`, `meal_photo_analysis`, `subscriptions`,
`calorie_logs`, `water_logs`, `usage_counters` e `user_consents` — não é
preciso apagar tabela por tabela na aplicação.

`audit_log` e `ai_usage_logs` usam `ON DELETE SET NULL` em vez de cascade
de propósito: o registro sobrevive anonimizado (sem `user_id`) em vez de
ser apagado, preservando histórico agregado (ex: custo total de IA por dia)
sem manter dado pessoal identificável depois que a conta é excluída.

## O que NÃO está implementado

- **Exportação de dados** (o usuário baixar uma cópia dos próprios dados)
  — mencionada como "quando viável" na auditoria original, não construída
  nesta rodada.
- **Retenção automática de fotos**: hoje as fotos ficam no Storage
  indefinidamente até a conta ser excluída ou o usuário apagar
  manualmente (não há endpoint de exclusão individual de foto nem
  expiração automática). Se o volume de Storage crescer, considere um job
  agendado apagando fotos com mais de N dias.
- **Purga periódica de `rate_limits`**: a tabela não tem limpeza
  automática (comentário deixado na migration
  `011_distributed_rate_limit.sql` com o `DELETE` a rodar manualmente ou
  via pg_cron se crescer demais).
