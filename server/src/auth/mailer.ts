import nodemailer from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Anything that can send an email. */
export interface Mailer {
  send(mail: Mail): Promise<boolean>;
}

/** SMTP (e.g. the hello@chalkpis.com mailbox at the domain host). Port 465 uses TLS from the start. */
export class SmtpMailer implements Mailer {
  private transport;
  constructor(
    opts: { host: string; port: number; user: string; pass: string },
    private from: string,
  ) {
    this.transport = nodemailer.createTransport({
      host: opts.host,
      port: opts.port,
      secure: opts.port === 465,
      auth: { user: opts.user, pass: opts.pass },
    });
  }
  async send(mail: Mail): Promise<boolean> {
    try {
      await this.transport.sendMail({ from: this.from, ...mail });
      return true;
    } catch {
      return false;
    }
  }
}

/** Local and test stand-in: keeps the mails instead of sending them. */
export class MockMailer implements Mailer {
  sent: Mail[] = [];
  async send(mail: Mail): Promise<boolean> {
    this.sent.push(mail);
    return true;
  }
}

/** The sign-in code email: plain text first, a small HTML version with the code large. */
export function codeMail(to: string, code: string): Mail {
  const subject = `${code} is your Chalkpis sign-in code`;
  const text = `Your Chalkpis sign-in code is ${code}.\n\nIt works for 10 minutes. If you did not ask for it, you can ignore this email.\n\nChalkpis for Tutors · M2W Technologies Private Limited`;
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:420px;margin:auto;padding:24px;color:#262626">
<p style="font-size:15px">Your Chalkpis sign-in code is</p>
<p style="font-size:34px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${code}</p>
<p style="font-size:13px;color:#686868">It works for 10 minutes. If you did not ask for it, you can ignore this email.</p>
<p style="font-size:12px;color:#a3a3a3;margin-top:24px">Chalkpis for Tutors · M2W Technologies Private Limited</p></div>`;
  return { to, subject, text, html };
}
