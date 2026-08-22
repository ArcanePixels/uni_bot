import { signIn, auth } from '@/lib/auth.js';
import { redirect } from 'next/navigation';
import { Logo, Discord } from '@/components/Icons.js';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user && !session.error) redirect('/');

  return (
    <div className="login-wrap">
      <div className="login-card">
        <span className="brand-mark">
          <Logo width={26} height={26} />
        </span>
        <h1>Discord Allrounder</h1>
        <p>
          Melde dich mit Discord an. Du siehst danach nur die Server, auf denen du
          tatsächlich Administrator bist oder „Server verwalten“ darfst.
        </p>
        <form
          action={async () => {
            'use server';
            await signIn('discord', { redirectTo: '/' });
          }}
        >
          <button type="submit">
            <Discord />
            Mit Discord anmelden
          </button>
        </form>
        <div className="login-foot">ein Werkzeug von ArcanePixels</div>
      </div>
    </div>
  );
}
