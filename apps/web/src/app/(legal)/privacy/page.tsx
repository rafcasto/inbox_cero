import type { Metadata } from 'next';
export const metadata: Metadata = { title: 'Privacy Policy · Atlas' };
const EFFECTIVE = '26 September 2026';

export default function Privacy() {
  return (
    <article>
      <h1>Privacy Policy</h1>
      <p className="meta">Effective {EFFECTIVE} · Atlas is operated by Digital Pathways, New Zealand ("we", "us"). Questions: <a href="mailto:rafael@digitalpathways.io">rafael@digitalpathways.io</a>.</p>

      <p>Atlas is a personal AI Chief of Staff. To do its job it reads information you connect to it — email, reminders, messages, bank statements — and organises it for you. This policy explains exactly what we collect, why, where it lives, who can see it, and how to get it out or delete it. We are bound by the New Zealand Privacy Act 2020 and, where they apply, the GDPR and the Google API Services User Data Policy.</p>

      <h2>1. What we collect</h2>
      <ul>
        <li><strong>Account data</strong> — email address, display name, timezone, password hash or Google sign-in identity, and your invite code.</li>
        <li><strong>Profile & settings</strong> — the priorities, rules, voice guide, finance categories, OKR and governance preferences you enter.</li>
        <li><strong>Connected mailboxes</strong> — with your explicit authorisation, message headers and bodies from the mailbox folders you choose to connect (Gmail via Google OAuth, or other providers via IMAP). We store a summary, the triage decision and the message text needed to display it.</li>
        <li><strong>Reminders, WhatsApp messages and voice/photo attachments</strong> you send to Atlas or sync from your phone.</li>
        <li><strong>Financial records</strong> — transactions from bank statement files you upload and receipts you forward. Atlas never connects to a bank account and never moves money.</li>
        <li><strong>Content and knowledge</strong> — ideas, drafts, notes and markdown documents you add.</li>
        <li><strong>Usage and audit logs</strong> — every automated action Atlas takes, who approved it, and the AI model usage it incurred, so you can see what your Chief of Staff did and why.</li>
      </ul>

      <h2>2. Why we process it</h2>
      <ul>
        <li>To triage, summarise, draft and organise your information — the service you asked for.</li>
        <li>To run the automations and check-ins you configure (schedules, nudges, OKR sessions).</li>
        <li>To keep the service secure and to show you an audit trail.</li>
        <li>To bill or meter usage per account. We do not sell data, build advertising profiles, or train AI models on your data.</li>
      </ul>

      <h2>3. Google user data and the Limited Use disclosure</h2>
      <p>If you connect a Gmail account, Atlas requests the <code>https://mail.google.com/</code> scope so it can read messages, move them between labels, and mark them read on your behalf. Atlas's use and transfer to any other app of information received from Google APIs will adhere to the <a href="https://developers.google.com/terms/api-services-user-data-policy#additional_requirements_for_specific_api_scopes" target="_blank" rel="noreferrer">Google API Services User Data Policy</a>, including the Limited Use requirements. Specifically:</p>
      <ul>
        <li>Gmail data is used only to provide the user-facing features of Atlas (triage, filing, drafting, receipts to your ledger).</li>
        <li>It is never transferred to third parties except as necessary to provide those features (the AI model provider below), to comply with law, or as part of a merger with notice to you.</li>
        <li>Humans never read your Gmail data except with your explicit permission for support, for security investigation, or where required by law.</li>
        <li>It is never used for advertising, and never used to train generalised AI or machine-learning models.</li>
      </ul>
      <p>You can revoke Atlas's access at any time at <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">myaccount.google.com/permissions</a> or by removing the mailbox in Settings → Integrations, which deletes the stored token.</p>

      <h2>4. AI processing</h2>
      <p>Judgement tasks — classifying, prioritising, summarising, drafting, facilitating your reviews — are performed by Anthropic's Claude models. Relevant excerpts of your data are sent to Anthropic for that processing under Anthropic's commercial terms, which prohibit training on customer data. Deterministic rules run first so that obvious noise never reaches the model. Every model call is logged with its purpose and cost, visible to you in Settings → AI.</p>

      <h2>5. Where your data lives and who else touches it</h2>
      <ul>
        <li><strong>Google Cloud / Firebase</strong> (Firestore, Authentication, Cloud Storage) in the <em>australia-southeast1</em> region — primary storage.</li>
        <li><strong>Vercel</strong> — hosts the web portal; processes requests in transit.</li>
        <li><strong>Upstash</strong> — a short-lived job queue and cache between the portal and the processing server; entries expire automatically.</li>
        <li><strong>Meta (WhatsApp Business Platform)</strong> — if you enable WhatsApp, messages between you and Atlas transit Meta's systems under Meta's terms.</li>
        <li><strong>Anthropic</strong> — AI processing as described above.</li>
        <li>A processing server operated by us. Integration credentials (mail tokens, passwords) are encrypted with AES-256-GCM before storage; the key is held only on that server.</li>
      </ul>
      <p>Some of these providers are outside New Zealand. We only use providers that commit to protections comparable to the Privacy Act 2020 (IPP 12).</p>

      <h2>6. Security</h2>
      <p>Per-user data isolation is enforced by database security rules and tested automatically. Traffic is encrypted in transit (TLS). Credentials are encrypted at rest. The processing server is not reachable from the internet; it pulls work from the queue. Automated actions that touch your mailbox or phone are approval-gated and audited; sending email, publishing content, deleting mail and moving money are never automated.</p>

      <h2>7. Retention and deletion</h2>
      <ul>
        <li>Your data is kept while your account is active.</li>
        <li><strong>Export</strong> everything (JSON) from Settings → Account at any time.</li>
        <li><strong>Delete</strong> your account from Settings → Account: all documents, files and credentials are deleted immediately; backups roll off within 30 days.</li>
        <li>Queue and cache entries expire automatically within hours.</li>
      </ul>

      <h2>8. Your rights</h2>
      <p>You may access, correct, export or delete your personal information at any time in the app, or by emailing us. You may complain to us first and, if unresolved, to the <a href="https://www.privacy.org.nz" target="_blank" rel="noreferrer">Office of the Privacy Commissioner</a> (New Zealand). If you are in the EU/UK you also have the rights set out in the GDPR/UK GDPR, including portability and objection.</p>

      <h2>9. Children</h2>
      <p>Atlas is not directed at people under 16 and we do not knowingly collect their information.</p>

      <h2>10. Changes</h2>
      <p>We will post changes here and update the effective date. Material changes will be announced in the app before they take effect.</p>
    </article>
  );
}
