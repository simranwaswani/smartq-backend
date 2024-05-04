
const bcrypt = require('bcrypt');
const jwtTokens = require('../utils/jwt-helper.js');
const ImageService = require("../services/ImageService.js");
const ProfileService = require("../services/ProfileService.js");
const {sendEmailWithOTP} = require('../utils/emailTransporter.js');
const OPTService = require('../services/OTPService.js');
const db = require('../models/index.js')

const User = db.UserModel;


/**
 * Login user and return jwt tokens and user data if successful else return error message
 * @param {*} req 
 * @param {*} res 
 * @returns  {object} tokens and user data
 */
const login = async (req, res) => {
    if (!req.body) {
        return res.status(400).send("Request body is missing");
    }

    const username_email = req.body.username || req.body.email;

    try {
        const user = await User.findOne({
            where: {
                [db.Sequelize.Op.or]: [{ username: username_email }, { email: username_email }]
            }
        });

        if (!user) {
            return res.status(404).send("User not found");
        }

        const validPassword = await bcrypt.compare(req.body.password, user.password);
        if (!validPassword) {
            return res.status(401).send("Invalid password");
        }

        await User.update({ lastlogin: new Date() }, { where: { userid: user.userid } });

        const images = await ImageService.getImagesByUserId(user.userid);

        const userData = { ...user.dataValues, password: undefined, images };

        const tokens = jwtTokens(userData);

        res.status(200).send({ tokens: tokens, user: userData });
    } catch (error) {
        console.error(error);
        return res.status(500).send("An error occurred while processing the login");
    }
};


/**
 * Register a new user and return jwt tokens and user data if successful else return error message
 * @param {*} req 
 * @param {*} res  
 * @returns  {object} tokens and user data
 */
const register = async (req, res) => {
    if (!req.body){
        return res.status(400).send("Request body is missing")
    }

    const hashPassword = await bcrypt.hash(req.body.password, 10);

    const user ={
        username: req.body.username,
        email: req.body.email,
        password: hashPassword,
        gender: req.body.gender,
        usertype: req.body.userType,
    }


    User.create(user).then((user) => {
        if (!user){
            return res.status(500).send("Error while registering the user")
        }

        user.password = undefined;

        const tokens = jwtTokens(user.dataValues);

        if (user.dataValues.usertype === 'vendor'){
            const vendorProfile = {
                businessname: null,
                businesstype: null,
                bio: null,
                dob: null,
                userid: user.userid
            }

            ProfileService.createVendorProfile(vendorProfile).then((vendorProfile) => {
                if (!vendorProfile){
                   vp = vendorProfile;
                }
            }).catch((err) => {
                throw new Error("Failed to create vendor profile.");
            });
        }

        res
        .cookie("access_token", tokens.accessToken, { httpOnly: true })
        .cookie("refresh_token", tokens.refreshToken, { httpOnly: true })
        .cookie("user", user.dataValues)
        .status(201)
        .send({tokens:tokens, user: user.dataValues, message: "User registered successfully"})
    }).catch((err) => {
        res.status(500).send(err)
    });
}


/**
 * Get email from user for password reset and send OTP to the email
 * @param {*} req 
 * @param {*} res 
 */
const forgotPassword = async (req, res) => {
    const { email } = req.body;

    console.log("Response Body: ", req.body);

    if (!email) {
        return res.status(400).send("Email address is required.");
    }

    try {
        const user = await User.findOne({ where: { email } });
        if (!user) {
            return res.status(404).send("User not found.");
        }

        console.log("Generating OTP for email:", email)

        const {otp, info } = await sendEmailWithOTP(email);
        console.log("OTP:", otp, "\nInfo:", info);

        
        // create OTP record in the database
        const optData = {
            email: email,
            otp: otp,
            expireTime:new Date(Date.now() + 600000),
        };

        // create OTP record in the database
        const otpRecord = await OPTService.createOTP(optData);
        console.log("OTP Record:", otpRecord);


        return res.status(200).send("OTP has been sent to your email. Please check your inbox to proceed.");
    } catch (error) {
        console.error("Error in requestPasswordReset:", error);
        res.status(500).send("An error occurred while processing your request.");
    }
}


/**
 * Varify the OPT
 * @param {*} req
 * @param {*} res
 */
const verifyOTP = async (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).send("Email and OTP are required.");
    }

    try {
        const otpRecord = await OPTService.getOTPByEmailAndExpireTime(email, 600000);
        if (!otpRecord) {
            return res.status(404).send("OTP not found or expired.");
        }

        if (otpRecord.otp !== otp) {
            return res.status(401).send("Invalid OTP.");
        }

        return res.status(200).send("OTP verified successfully.");
    } catch (error) {
        console.error("Error in verifyOTP:", error);
        res.status(500).send("An error occurred while verifying the OTP.");
    }
}


/**
 * 
 * @param {*} req 
 * @param {*} res 
 * @returns 
 */
const resetPassword = async (req, res) => {
    console.log(req.body);
    
    if (!req.body){
        return res.status(400).send("Request body is missing")
    }

    const hashPassword = await bcrypt.hash(req.body.password, 10);

    const email_username = req.body.username ? req.body.username : req.body.email;

    User.findOne({
        where: {
            [db.Sequelize.Op.or]: [{ username: email_username }, { email: email_username }]
        }
    }).then((user) => {
        if (!user){
            return res.status(404).send("User not found")
        }

        User.update({
            password: hashPassword,
        }, { where : { userid: user.userid } }
        ).then((updatedUser) => {
            if (!updatedUser){
                return res.status(500).send("Error while updating the user password")
            }

            user.password = undefined;

            const tokens = jwtTokens(user.dataValues);

            res.status(200).send({tokens: tokens, user: user.dataValues, message: "Password reset successful"})
        }).catch((err) => {
            console.log(err)
            return res.status(500).send("Error while updating the user password")
        });
    }).catch((err) => {
        return res.status(500).send("Error while finding the user")
    });
}




const logout = async (req, res) => {
    console.log(req.body),
    res.send("User has logged out")
}

module.exports = {
    login,
    register,
    resetPassword,
    logout,
    forgotPassword,
    verifyOTP
};
