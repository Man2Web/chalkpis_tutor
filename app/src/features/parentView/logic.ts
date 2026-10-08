export const LINK_DAYS = [7, 30, 90] as const;
export type LinkDays = (typeof LINK_DAYS)[number];

export interface LinkMessageVars {
  parent: string;
  student: string;
  institute: string;
  url: string;
}

/** The note that goes with the link (editable by the tutor before sending). */
export function linkMessage(lang: 'en' | 'hi', v: LinkMessageVars): string {
  const name = v.parent.trim();
  if (lang === 'hi') {
    return `${name ? `प्रिय ${name},` : 'नमस्ते,'}\n${v.institute} में ${v.student} की उपस्थिति और फीस देखने के लिए यह निजी लिंक खोलें:\n${v.url}\nकृपया इसे किसी और को न भेजें।`;
  }
  return `${name ? `Dear ${name},` : 'Hello,'}\nOpen this private link to see ${v.student}'s attendance and fees at ${v.institute}:\n${v.url}\nPlease do not forward it.`;
}
