# Delivering to readers other than Kindle

Checked 2026-10-01. The recommendation below is built: see "Download link" in the README.

| Reader | Accepts email? | What works today | Best option for us |
|---|---|---|---|
| Kindle | Yes, Send to Kindle, approved senders only | Built | Done |
| PocketBook | Yes, Send-to-PocketBook (`@pbsync.com`), approved senders | Same flow as Kindle | Done, already accepted by the site |
| Boox | No email inbox. BooxDrop and Send2Boox need the reader to push files from their own account | The Kindle app on the Boox, using its Send to Kindle address | Kindle app now; private download link later |
| Kobo | No. Dropbox and Google Drive sync only on some models | Kobo's built-in browser can download an EPUB into the library | Private download link |
| reMarkable | No. Email is outbound only (from the tablet) | Upload through the reMarkable app, or Google Drive and Dropbox with a paid Connect plan | Private download link, imported by hand |

## Notes

- **Boox.** Boox tablets run Android, so the Kindle app works and Send to Kindle reaches it. Send2Boox and BooxDrop have no public API for a third party to push into someone's account.
- **Kobo.** There is no "Send to Kobo" for outside senders. Writing into a reader's Dropbox or Google Drive would mean asking for access to their files, which is more than the paper should hold. The Kobo browser can open a link and save an EPUB to the library.
- **reMarkable.** The tablet only sends email. Third-party tools that email files to it (Remailable, Send2Remarkable) work through reMarkable's unofficial cloud API, which could break or breach their terms. Not worth depending on.

## Recommendation

One feature covers Kobo, reMarkable and anyone without an email inbox: a private, unguessable link per reader (built as `quietcourier.com/read/<token>`), that always serves that reader's latest edition in their format. Bookmark it in the reader's browser and tap it each morning. The same link can also serve an OPDS feed for apps like KOReader. The token must be revocable from the account page.

## Sources

- Kobo: Good e-Reader on Kobo email transfer (goodereader.com/blog/?p=380027); NetGalley's Send to Kobo (help.kobo.com, article 32244791356311).
- Boox: The eBook Reader, "9 ways to transfer files to and from Onyx Boox devices" (2023-02-21).
- reMarkable: support.remarkable.com, "Send by email"; github.com/rmitchellscott/Send2Remarkable; github.com/j6k4m8/remailable.
