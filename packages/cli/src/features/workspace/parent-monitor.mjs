// This preloader runs before Next.js so an abruptly exited CLI cannot orphan its server.
process.once("disconnect", () => process.exit(0));
