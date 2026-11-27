import { Link } from 'react-router-dom';
import { Card, PageHeader } from '../components/ui';

export function NotFound() {
  return (
    <div className="content">
      <PageHeader title="Halaman tidak ditemukan" subtitle="Tautan yang Anda buka tidak tersedia." />
      <Card>
        <p>
          Kembali ke <Link to="/">dashboard</Link>.
        </p>
      </Card>
    </div>
  );
}
