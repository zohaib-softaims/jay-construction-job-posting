import { getUserByEmail, createUserByRole,updateUserEmailVerificationStatus } from "./services.js";
import bcrypt from "bcrypt";
import { sendMail } from "../../utils/email.utils.js";
import { userDto } from "./dtos/userDto.js";

export const createUser = async (req, res) => {
  const { role, email, password } = req.body;

  try {
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      return res.status(409).json({
        success: false,
        message: "User with this email already exists.",
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate verification token using bcrypt and expiry
    const tokenPlain = `${email}-${Date.now()}`; 
    const verificationToken = await bcrypt.hash(tokenPlain, 10);
    const verificationTokenExpiry = new Date(Date.now() + 3600000); // 1 hour expiry

    const userData = {
      ...req.body,
      password: hashedPassword,
      verificationToken,
      verificationTokenExpiry,
    };
    const newUser = await createUserByRole(role, userData);

    const verificationUrl = `${
      process.env.CLIENT_URL
    }/verify-email?email=${encodeURIComponent(
      email
    )}&token=${encodeURIComponent(verificationToken)}`;

    await sendMail(email, "Email Verification", verificationUrl);
    console.log("new user",newUser)
console.log("final data",userDto(newUser))
    return res.status(201).json({
      success: true,
      message: "User registered successfully. Please verify your email.",
      data: userDto(newUser),
    });
  } catch (error) {
    console.error("Signup error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error during user signup",
      error: Array.isArray(error.message) ? error.message : [error.message],
    });
  }
};




export const verifyEmail = async (req, res) => {
  const { email, token } = req.body;
  try {
    const user = await getUserByEmail(email);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.verifyEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified",
      });
    }

    if (user.verificationTokenExpiry < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Verification token has expired",
      });
    }

    const isMatch = token===user.verificationToken
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Invalid verification token",
      });
    }

    await updateUserEmailVerificationStatus(user._id);

    return res.status(200).json({
      success: true,
      message: "Email verified successfully",
    });
  } catch (error) {
    console.error("Email verification error:", err);
    return res.status(500).json({
      success: false,
      message: "Internal server error during email verification.",
      error: Array.isArray(error.message) ? error.message : [error.message],
    });
  }
};



export const resendVerificationEmail = async (req, res) => {
  const { email } = req.body;

  try {
    const user = await getUserByEmail(email.toLowerCase());
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (user.verifyEmail) {
      return res.status(400).json({
        success: false,
        message: "Email is already verified.",
      });
    }

    if (
      user.verificationTokenExpiry &&
      user.verificationTokenExpiry > Date.now()
    ) {
      return res.status(400).json({
        success: false,
        message:
          "A verification email has already been sent recently. Check your mail",
      });
    }

    const saltRounds = 10;
    const tokenPlain = `${email}-${Date.now()}`;
    const verificationToken = await bcrypt.hash(tokenPlain, saltRounds);
    const verificationTokenExpiry = new Date(Date.now() + 3600000); // 1 hour expiry

    user.verificationToken = verificationToken;
    user.verificationTokenExpiry = verificationTokenExpiry;
    await user.save();

    const verificationUrl = `${
      process.env.CLIENT_URL
    }/verify-email?email=${encodeURIComponent(
      email
    )}&token=${encodeURIComponent(verificationToken)}`;

    await sendMail(email, "Resend Email Verification", verificationUrl);

    return res.status(200).json({
      success: true,
      message: "Verification email resent successfully.",
    });
  } catch (error) {
    console.error("Resend verification email error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during resend verification email.",
      error: Array.isArray(error.message) ? error.message : [error.message],
    });
  }
};



const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await getUserByEmail(email.toLowerCase());

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found.",
      });
    }

    if (!user.verifyEmail) {

      if (
        !user.verificationTokenExpiry ||
        user.verificationTokenExpiry <= Date.now()
      ) {
        const saltRounds = 10;
        const tokenPlain = `${email}-${Date.now()}`;
        const verificationToken = await bcrypt.hash(tokenPlain, saltRounds);
        const verificationTokenExpiry = new Date(Date.now() + 3600000); // 1 hour expiry

        user.verificationToken = verificationToken;
        user.verificationTokenExpiry = verificationTokenExpiry;
        await user.save();

        const verificationUrl = `${
          process.env.CLIENT_URL
        }/verify-email?email=${encodeURIComponent(
          email
        )}&token=${encodeURIComponent(verificationToken)}`;

        await sendMail(email, "Resend Email Verification", verificationUrl);

        return res.status(403).json({
          success: false,
          message:
            "Your account is not verified. A new verification email has been sent.",
        });
      }

      return res.status(403).json({
        success: false,
        message:
          "Your account is not verified. Please check your email for the verification link.",
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Incorrect password.",
      });
    }

    const tokenPayload = {
      userId: user._id,
      email: user.email,
     role:user.role
    };

    const token = jwt.sign(tokenPayload, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });

    // Set JWT token in HTTP-only cookie
    res.cookie("access_token", token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production", // Use secure cookies in production
      sameSite: "lax", // Adjust sameSite to 'lax' for compatibility
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });


    return res.status(200).json({
      success: true,
      message: "Login successful.",
      user: userDto(user),
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error during login.",
      error: error.message,
    });
  }
};

