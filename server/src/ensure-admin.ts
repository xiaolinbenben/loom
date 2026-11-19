import { adminAccountNotice, ensureAdminAccount } from "./admin-account.js";

const notice = adminAccountNotice(ensureAdminAccount(), "report");
if (notice) console.log(notice);
