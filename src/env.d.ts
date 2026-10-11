declare namespace App {
  interface Locals {
    /** Who is making the request, per Cloudflare Access. */
    viewer: { email?: string; serviceToken?: string; isOwner: boolean };
  }
}
