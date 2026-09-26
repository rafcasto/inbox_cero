import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Terms of Service · Atlas' };
const EFFECTIVE = '26 September 2026';

export default function Terms() {
  return (
    <article>
      <h1>Terms of Service</h1>
      <p className="meta">Effective {EFFECTIVE} · Between you and Digital Pathways, New Zealand ("Atlas", "we"). Contact: <a href="mailto:rafael@digitalpathways.io">rafael@digitalpathways.io</a>.</p>

      <h2>1. The service</h2>
      <p>Atlas is an invite-only, beta software service that triages your inputs, organises work, drafts content, keeps a ledger and facilitates goal reviews using AI. By creating an account you agree to these terms and to the <a href="/privacy">Privacy Policy</a>.</p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be 16 or older and provide accurate details. Keep your credentials confidential; you are responsible for activity under your account.</li>
        <li>Accounts are created with an invite code and are personal; do not share access.</li>
        <li>You may delete your account at any time from Settings → Account.</li>
      </ul>

      <h2>3. Your data and connections</h2>
      <ul>
        <li>You own your data. You grant us only the rights needed to operate the service for you as described in the Privacy Policy.</li>
        <li>You are responsible for having the right to connect the mailboxes, messaging accounts and documents you connect, and for the consequences of the rules and permission modes you configure.</li>
        <li>Atlas never sends email, publishes content, deletes mail or moves money on its own. Actions that touch your mailbox or phone are subject to the governance settings you choose and are recorded in your audit log.</li>
      </ul>

      <h2>4. AI output and financial information</h2>
      <p>Atlas produces suggestions — triage decisions, summaries, drafts, categorisations, financial views and OKR analysis. They can be wrong. You must review anything before you rely on it. Nothing in Atlas is financial, tax, legal or accounting advice; the ledger and GST export are conveniences for you and your accountant, not a substitute for them.</p>

      <h2>5. Acceptable use</h2>
      <ul>
        <li>No unlawful content, no processing of other people's data without a lawful basis, no attempts to access other users' data or to circumvent security or governance controls.</li>
        <li>No reverse engineering of the service beyond what the open-source licence of the codebase permits.</li>
        <li>Reasonable use: we may rate-limit automated processing per account to keep the service healthy for everyone.</li>
      </ul>

      <h2>6. Third-party services</h2>
      <p>Google, Meta (WhatsApp), Apple, Anthropic, Vercel, Upstash and your bank or accounting tools are independent services with their own terms. We are not responsible for their availability or changes to their APIs, though we will make reasonable efforts to adapt.</p>

      <h2>7. Beta, availability and changes</h2>
      <p>Atlas is in beta: features may change, be added or removed, and interruptions may occur. We may suspend or terminate accounts that breach these terms. You may stop using the service at any time; on termination we delete your data as described in the Privacy Policy.</p>

      <h2>8. Fees</h2>
      <p>Atlas is currently free for invited users. If we introduce fees we will give at least 30 days' notice and you may close your account before they apply.</p>

      <h2>9. Warranties and liability</h2>
      <p>The service is provided "as is". To the fullest extent permitted by law we exclude all implied warranties. If you use Atlas for business purposes you agree that the Consumer Guarantees Act 1993 does not apply. Our total liability for any claim is limited to NZD 100 or the fees you paid in the previous 12 months, whichever is greater. We are not liable for indirect or consequential loss, including loss of data you have not exported, loss arising from AI output, or from third-party services. Nothing in these terms limits liability that cannot be limited by law.</p>

      <h2>10. Intellectual property</h2>
      <p>The Atlas software is licensed under its open-source licence in the public repository. Our name and logo are ours; your data and the content you create with Atlas are yours.</p>

      <h2>11. Governing law</h2>
      <p>These terms are governed by the laws of New Zealand and the courts of New Zealand have exclusive jurisdiction.</p>

      <h2>12. Changes to these terms</h2>
      <p>We will post updated terms here with a new effective date and notify you in the app of material changes at least 14 days before they apply.</p>
    </article>
  );
}
