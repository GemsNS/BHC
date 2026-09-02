# GoDaddy email for the quote / contact form

The customer quote form on **bhcontracting.ca** posts to `POST /api/contact`. That route sends email to your team when someone submits a quote request.

## Do you need a GoDaddy API key?

**No.** GoDaddy business email does **not** use an API key like Resend or Stripe.

You configure the app with **SMTP** — the same settings you would use in Outlook, Apple Mail, or your phone:

| Setting | GoDaddy Workspace Email | GoDaddy Microsoft 365 |
|---------|------------------------|------------------------|
| **SMTP server** | `smtpout.secureserver.net` | `smtp.office365.com` |
| **Port** | `465` | `587` |
| **Encryption** | SSL (`SMTP_SECURE=true`) | STARTTLS (`SMTP_SECURE=false`) |
| **Username** | Full email address | Full email address |
| **Password** | Mailbox password | Mailbox password |

Create or use an existing mailbox in GoDaddy (e.g. `quotes@bhcontracting.ca` or `info@bhcontracting.ca`).

---

## Step 1 — GoDaddy mailbox

1. Log in to [GoDaddy](https://www.godaddy.com/) → **My Products** → **Email**.
2. Open your **@bhcontracting.ca** mailbox (or create one, e.g. `quotes@bhcontracting.ca`).
3. Note the **email address** and **password** (reset password if needed).

Optional: use a dedicated sending address like `quotes@bhcontracting.ca` and deliver inquiries to `info@bhcontracting.ca`.

---

## Microsoft 365 — enable SMTP at **tenant** level (required)

`info@bhcontracting.ca` uses **GoDaddy Microsoft 365**. Enabling Authenticated SMTP on the mailbox alone is not enough if the **tenant** still blocks it.

If you see:

> `535 5.7.139 … SmtpClientAuthentication is disabled for the Tenant`

do **both**:

### A. Mailbox (you may have done this already)

1. GoDaddy → **Email & Office** → **Manage** → select `info@bhcontracting.ca`
2. Turn on **Authenticated SMTP** for that mailbox

### B. Organization / tenant (still required)

1. Open **Microsoft 365 admin center** (from GoDaddy email dashboard → **Advanced Settings** / **Admin**)
2. If you have Exchange admin access, connect **Exchange Online PowerShell** and run:

```powershell
Set-TransportConfig -SmtpClientAuthenticationDisabled $false
Set-CASMailbox -Identity info@bhcontracting.ca -SmtpClientAuthenticationDisabled $false
```

3. If you **cannot** run PowerShell, contact **GoDaddy Support** and ask them to enable **SMTP AUTH (Authenticated SMTP) at the tenant level** for your Microsoft 365 organization.

### C. Security Defaults (if still failing)

Microsoft **Security Defaults** in Entra ID can block SMTP even when SMTP AUTH is on. In [Microsoft Entra admin center](https://entra.microsoft.com) → **Properties** → **Security defaults** — if enabled, either disable it or ask GoDaddy how to allow SMTP for `info@bhcontracting.ca`.

Changes can take **15–60 minutes** to propagate.

---

## Step 2 — Server `.env` (production VM)

SSH to the server and edit `/opt/bhc/.env` or `/etc/bhc/bhc.env` (wherever your app loads env):

```bash
# GoDaddy Workspace Email (most common)
SMTP_HOST=smtpout.secureserver.net
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=quotes@bhcontracting.ca
SMTP_PASS=your-mailbox-password-here
SMTP_FROM=BH Contracting LTD. <quotes@bhcontracting.ca>
CONTACT_TO_EMAIL=info@bhcontracting.ca
```

**Microsoft 365 via GoDaddy** — use instead:

```bash
SMTP_HOST=smtp.office365.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=quotes@bhcontracting.ca
SMTP_PASS=your-mailbox-password-here
SMTP_FROM=BH Contracting LTD. <quotes@bhcontracting.ca>
CONTACT_TO_EMAIL=info@bhcontracting.ca
```

Restart the app:

```bash
sudo systemctl restart bhc
```

---

## Step 3 — Verify

```bash
# Should return {"ok":true,"configured":true,"provider":"smtp"}
curl -s https://bhcontracting.ca/api/contact

# Test send (use a real phone/details in production test)
curl -s -X POST https://bhcontracting.ca/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"name":"Test","email":"you@example.com","phone":"9025551234","details":"SMTP test","quoteType":"exterior"}'
```

Submit the form on the website — you should receive email at `CONTACT_TO_EMAIL`. The customer's address is set as **Reply-To** so you can reply directly.

---

## Alternative: Resend API

If you prefer an API key instead of GoDaddy SMTP:

1. Sign up at [resend.com](https://resend.com)
2. Verify domain `bhcontracting.ca`
3. Set in `.env`:

```bash
RESEND_API_KEY=re_xxxxxxxx
RESEND_FROM_EMAIL=BH Contracting LTD. <quotes@bhcontracting.ca>
CONTACT_TO_EMAIL=info@bhcontracting.ca
```

**SMTP is tried first** when `SMTP_HOST`, `SMTP_USER`, and `SMTP_PASS` are set. Resend is used only if SMTP is not configured.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Frontend: "Email is not configured…" | Add SMTP or RESEND vars to server `.env` and restart `bhc` |
| 500 after submit | Wrong SMTP password, or GoDaddy blocking relay — confirm login at webmail |
| **535 authentication rejected** | Wrong password, SMTP not enabled, or (M365) **Authenticated SMTP** disabled for the mailbox |
| Microsoft 365 auth fails | GoDaddy → Email → Manage → enable SMTP; in Microsoft 365 admin enable **Authenticated SMTP** for `info@bhcontracting.ca` |
| Emails go to spam | Set `SMTP_FROM` to the same address as `SMTP_USER` |

**Never commit** `SMTP_PASS` or API keys to git.
