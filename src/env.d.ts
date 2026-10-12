declare namespace App {
  interface Locals {
    /** Who is viewing: nobody (signed out), a signed-in Google user, or the owner. */
    viewer: { uid?: string; email?: string; name?: string; avatar?: string | null; isOwner: boolean };
  }
}
