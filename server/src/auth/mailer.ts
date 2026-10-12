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
