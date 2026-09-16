// Temporary, leadership-requested toggles. Keep these self-contained so a
// rollback is a single edit rather than an archaeology dig through the codebase.
//
// (No flags currently active. The ADMINS_CAN_CREATE_USERS toggle that used to
// live here was retired in 2026: leadership now wants admins able to create
// readers/auditeurs/donateurs, with only permanents/admin accounts staying
// super_admin-only — see the isLoginAccount check in app/api/user/route.ts.)
