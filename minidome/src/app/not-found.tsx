import Link from "next/link";
import { MinidomeLogo } from "@/components/logo";

export default function NotFound() {
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="card !mx-0 max-w-sm p-6 text-center">
        <MinidomeLogo size={56} className="mx-auto mb-2 opacity-80" />
        <h1 className="text-lg font-extrabold">Incomplete pass</h1>
        <p className="mt-1 text-sm text-gray-500">That page isn&apos;t here, or you don&apos;t have access to it.</p>
        <Link href="/" className="btn-primary mt-4">Back to Home</Link>
      </div>
    </main>
  );
}
