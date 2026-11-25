import { Link } from 'react-router-dom';
import { Card, EmptyState } from '@/components/ui/primitives';

export default function NotFoundPage() {
  return (
    <Card>
      <EmptyState title="Page not found" description="The page you are looking for does not exist." action={<Link to="/" className="text-sm text-teal-700 hover:underline">Back to dashboard</Link>} />
    </Card>
  );
}
