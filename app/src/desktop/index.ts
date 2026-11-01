import type { ReactNode } from 'react';

/**
 * The phone apps never show the desktop layout (useDesktop is false there), so they get these stand-ins instead of
 * the real screens in index.web.ts, and none of that code goes into the phone bundle.
 */
export function DesktopShell({ children }: { enabled: boolean; children: ReactNode }) {
  return children;
}
const none = () => null;
export const DesktopHome = none;
export const DesktopStudents = none;
export const DesktopAttendance = none;
export const DesktopFees = none;
