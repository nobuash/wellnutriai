import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Clock } from 'lucide-react';
import Link from 'next/link';
import { privateMetadata } from '@/lib/seo';

export const metadata = privateMetadata('Pagamento pendente — WellNutriAI');

export default function PaymentPendingPage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <Clock className="h-16 w-16 text-warning" strokeWidth={1.5} />
        </div>
        <h1 className="font-display text-2xl text-ink">Pagamento em análise</h1>
        <p className="text-ink-secondary">
          Seu pagamento está sendo processado pelo Mercado Pago.
          Assim que for confirmado, seu plano será atualizado automaticamente —
          você receberá uma notificação por e-mail.
        </p>
        <p className="text-xs text-ink-muted">
          Pagamentos via boleto podem levar até 3 dias úteis para serem compensados.
        </p>
        <Link href="/dashboard">
          <Button className="w-full" variant="outline">Voltar ao dashboard</Button>
        </Link>
      </Card>
    </div>
  );
}
