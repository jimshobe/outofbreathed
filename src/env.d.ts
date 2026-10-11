declare namespace App {
  interface Locals {
    /** The Cloudflare Access identity of the signed-in viewer. */
    user: { email: string };
  }
}
