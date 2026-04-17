import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { XCircle } from 'lucide-react';
import Link from 'next/link';

export default function PaymentFailurePage() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="max-w-md w-full text-center space-y-4">
        <div className="flex justify-center">
          <XCircle className="h-16 w-16 text-red-500" />
        </div>
        <h1 className="text-2xl font-bold">Pagamento não concluído</h1>
        <p className="text-slate-500">
          Houve um problema ao processar seu pagamento. Nenhuma cobrança foi realizada.
          Você pode tentar novamente a qualquer momento.
        </p>
        <div className="flex flex-col gap-2">
          <Link href="/pricing">
            <Button className="w-full">Tentar novamente</Button>
          </Link>
          <Link href="/dashboard">
            <Button className="w-full" variant="outline">Voltar ao dashboard</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}
