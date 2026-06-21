/** The authenticated identity as resolved by the backend session, server-authoritative. */
export interface AuthUser {
  email: string;
  name: string;
  /** True when the email is on the backend editor allow-list. Computed server-side. */
  canEdit: boolean;
}
