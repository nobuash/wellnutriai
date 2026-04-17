import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';

export default function PaymentSuccessPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-500" />
        </div>
        <h1 className="text-2xl font-bold">Pagamento confirmado!</h1>
        <p className="text-slate-500">
          Bem-vindo ao <strong>WellNutriAI PRO</strong>. Sua assinatura foi ativada com sucesso.
          Aproveite planos ilimitados, chat sem restrições e análise por foto.
        </p>
        <p className="text-xs text-slate-400">
          O plano pode levar alguns instantes para ser atualizado. Se ainda aparecer como Free,
          atualize a página.
        </p>
        <Link href="/dashboard">
          <Button className="w-full">Ir para o dashboard</Button>
        </Link>
      </Card>
    </div>
  );
}
