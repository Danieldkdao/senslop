ALTER TABLE "device_codes" DROP CONSTRAINT "device_codes_user_id_users_id_fk";
--> statement-breakpoint
DROP INDEX "account_user_idx";--> statement-breakpoint
DROP INDEX "device_code_unique";--> statement-breakpoint
DROP INDEX "user_code_unique";--> statement-breakpoint
DROP INDEX "session_user_idx";--> statement-breakpoint
DROP INDEX "verification_identifier_idx";--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sessions" ALTER COLUMN "updated_at" DROP DEFAULT;--> statement-breakpoint
CREATE INDEX "accounts_userId_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "deviceCodes_deviceCode_uidx" ON "device_codes" USING btree ("device_code");--> statement-breakpoint
CREATE UNIQUE INDEX "deviceCodes_userCode_uidx" ON "device_codes" USING btree ("user_code");--> statement-breakpoint
CREATE INDEX "sessions_userId_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verifications_identifier_idx" ON "verifications" USING btree ("identifier");