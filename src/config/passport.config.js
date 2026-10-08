import passport from "passport";
import { Op } from "sequelize";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import db from "./database/models/postgre-models/index.js";
import { env } from "./env.config.js";
import AuthService from "../modules/auth/auth.service.js";

passport.use(

  new GoogleStrategy(
    {
      clientID: env.GOOGLE.CLIENT_ID,
      clientSecret: env.GOOGLE.CLIENT_SECRET,
      callbackURL: env.GOOGLE.CALLBACK_URL,
      passReqToCallback: true,
    },
    async (req, accessToken, refreshToken, profile, done) => {

      try {
        console.log("Google Account Profile Details:", JSON.stringify(profile, null, 2));

        const email = profile.emails?.[0]?.value?.toLowerCase();
        if (!email) {
          return done(null, false, { message: "No email address returned from Google." });
        }

        const emailVerifiedClaim = profile._json?.email_verified ?? profile.emails?.[0]?.verified;
        if (emailVerifiedClaim === false || emailVerifiedClaim === "false") {
          return done(null, false, { message: "Your Google account email is not verified." });
        }

        let user = await db.Users.findOne({
          where: {
            [Op.and]: [
              db.sequelize.where(db.sequelize.fn("LOWER", db.sequelize.col("email")), email),
              { is_deleted: false, is_sample_data: false },
            ],
          },
          order: [["root_user", "DESC"], ["created_at", "ASC"]],
        });
        if (!user) {
          console.log("User not found by email, auto-registering via Google:", email);
          user = await AuthService.autoRegisterGoogleUser(profile, email);
        }

        if (!user.is_active) {
          return done(null, false, { message: "User account is deactivated." });
        }

        if (user.is_locked) {
          return done(null, false, { message: "User account is locked." });
        }

        if (user.has_login === false) {
          return done(null, false, { message: "This account is not enabled for sign-in." });
        }

        if (!user.is_verified) {
          await user.update({ is_verified: true, otp: null, expires_at: null });
        }

        // Link the user's social account if it doesn't exist
        const [socialAccount] = await db.UserSocialAccount.findOrCreate({
          where: {
            provider: "google",
            provider_user_id: profile.id,
          },
          defaults: {
            user_id: user.users_id,
            profile_data: profile,
          },
        });

        // Check if linked to another user
        if (socialAccount.user_id !== user.users_id) {
          return done(null, false, { message: "This social account is linked to another user." });
        }
        if (user.auth_provider !== "google" && !user.password) {
          await user.update({ auth_provider: "google" });
        }

        return done(null, user);
      } catch (error) {
        return done(error);
      }
    }
  )
);
