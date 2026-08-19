const dns = require("dns");

dns.setServers(["8.8.8.8", "1.1.1.1"]);

const path = require("path");
const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const nodemailer = require("nodemailer")
const crypto = require("crypto");;
const emailTransporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_APP_PASSWORD
    }
});

const app = express();

const PORT = 3000;
const MONGODB_URI = process.env.MONGODB_URI;
const JWT_SECRET = process.env.JWT_SECRET;

const client = new MongoClient(MONGODB_URI);

app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

function roundMoney(value) {
    return Math.round((value + Number.EPSILON) * 100) / 100;
}
// Health Check API
app.get("/api/health", (req, res) => {
  res.json({
    status: "ok",
    server: "TRADEX",
    time: new Date()
  });
});
// ==========================================
// JWT AUTHENTICATION MIDDLEWARE
// ==========================================

function authenticateToken(req, res, next) {
    const authHeader = req.headers["authorization"];

    if (!authHeader) {
        return res.status(401).json({
            message: "Access token required."
        });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
        return res.status(401).json({
            message: "Invalid authorization format."
        });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET);

        req.user = decoded;

        next();

    } catch (error) {
        return res.status(403).json({
            message: "Invalid or expired token."
        });
    }
}

async function startServer() {
    try {
        await client.connect();

        console.log("MongoDB connected successfully!");

        const database = client.db("paperTradingDB");
        const usersCollection = database.collection("users");
        const stocksCollection = database.collection("stocks");
        const holdingsCollection = database.collection("holdings");
        const ordersCollection = database.collection("orders");
        const watchlistCollection = database.collection("watchlist");




        // ==========================================
// AUTOMATIC SIMULATED PRICE ENGINE
// ==========================================

async function updateSimulatedPrices() {
    try {
        const stocks = await stocksCollection.find({}).toArray();

        for (const stock of stocks) {
            const oldPrice = Number(stock.currentPrice);

            if (!Number.isFinite(oldPrice) || oldPrice <= 0) {
                continue;
            }

            // Random price movement
            const movementPercent =
                (Math.random() - 0.5) * 0.02;

            let newPrice =
                oldPrice * (1 + movementPercent);

            // Round to 2 decimal places
            newPrice = Number(newPrice.toFixed(2));

            if (newPrice <= 0) {
                continue;
            }

            await stocksCollection.updateOne(
                { _id: stock._id },
                {
                    $set: {
                        currentPrice: newPrice,
                        updatedAt: new Date()
                    }
                }
            );
        }

        console.log("📈 Simulated stock prices updated");

    } catch (error) {
        console.error(
            "Price engine error:",
            error.message
        );
    }
}
        // ==========================================
        // HOME ROUTE
        // ==========================================

        app.get("/", (req, res) => {
            res.send("Paper Trading App Server is Running!");
        });

        // ==========================================
        // REGISTER USER
        // ==========================================

        app.post("/api/register", async (req, res) => {
            try {
                const { name, email, password } = req.body;

                if (!name || !email || !password) {
                    return res.status(400).json({
                        message: "Name, email and password are required."
                    });
                }

                const normalizedEmail = email.toLowerCase().trim();

                const existingUser = await usersCollection.findOne({
                    email: normalizedEmail
                });

                if (existingUser) {
                    return res.status(409).json({
                        message: "Email already registered."
                    });
                }

                const passwordHash = await bcrypt.hash(password, 10);

                const newUser = {
                    name: name.trim(),
                    email: normalizedEmail,
                    passwordHash: passwordHash,

                    // Starting virtual money
                    virtualBalance: 1000000,

                    createdAt: new Date(),
                    updatedAt: new Date()
                };

                const result = await usersCollection.insertOne(newUser);

                res.status(201).json({
                    message: "Registration successful!",
                    userId: result.insertedId
                });

            } catch (error) {
                console.error("Registration error:", error);

                res.status(500).json({
                    message: "Something went wrong."
                });
            }
        });

        // ==========================================
        // LOGIN USER
        // ==========================================

        app.post("/api/login", async (req, res) => {
            try {
                const { email, password } = req.body;

                // Check required fields
                if (!email || !password) {
                    return res.status(400).json({
                        message: "Email and password are required."
                    });
                }

                const normalizedEmail = email.toLowerCase().trim();

                // Find user
                const user = await usersCollection.findOne({
                    email: normalizedEmail
                });

                if (!user) {
                    return res.status(401).json({
                        message: "Invalid email or password."
                    });
                }

                // Compare password with hashed password
                const passwordMatch = await bcrypt.compare(
                    password,
                    user.passwordHash
                );

                if (!passwordMatch) {
                    return res.status(401).json({
                        message: "Invalid email or password."
                    });
                }

                // Create JWT token
                const token = jwt.sign(
                    {
                        userId: user._id.toString(),
                        email: user.email
                    },
                    JWT_SECRET,
                    {
                        expiresIn: "7d"
                    }
                );

                res.status(200).json({
                    message: "Login successful!",
                    token: token,
                    user: {
                        id: user._id,
                        name: user.name,
                        email: user.email,
                        virtualBalance: user.virtualBalance
                    }
                });

            } catch (error) {
                console.error("Login error:", error);

                res.status(500).json({
                    message: "Something went wrong."
                });
            }
        });


// ==========================================
// FORGOT PASSWORD
// ==========================================

app.post("/api/forgot-password", async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                message: "Email is required."
            });
        }

        const normalizedEmail = email.toLowerCase().trim();

        const user = await usersCollection.findOne({
            email: normalizedEmail
        });

        // Don't reveal whether an account exists
        if (!user) {
            return res.status(200).json({
                message: "If an account exists with this email, a password reset link has been sent."
            });
        }

        // Generate secure reset token
        const resetToken = crypto.randomBytes(32).toString("hex");

        // Hash token before storing it in database
        const resetTokenHash = crypto
            .createHash("sha256")
            .update(resetToken)
            .digest("hex");

        // Token expires after 15 minutes
        const resetTokenExpiry =
            new Date(Date.now() + 15 * 60 * 1000);

        await usersCollection.updateOne(
            {
                _id: user._id
            },
            {
                $set: {
                    resetTokenHash: resetTokenHash,
                    resetTokenExpiry: resetTokenExpiry,
                    updatedAt: new Date()
                }
            }
        );

        // Password reset page
        const resetLink =
            `${process.env.RESET_BASE_URL}/reset-password.html?token=${resetToken}`;

        await emailTransporter.sendMail({
            from: `"TradeX" <${process.env.EMAIL_USER}>`,
            to: user.email,
            subject: "TradeX Password Reset",
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
                    <h2>TradeX Password Reset</h2>

                    <p>Hello ${user.name},</p>

                    <p>
                        We received a request to reset your TradeX password.
                    </p>

                    <p>
                        Click the button below to create a new password.
                    </p>

                    <p>
                        <a
                            href="${resetLink}"
                            style="
                                display:inline-block;
                                padding:12px 20px;
                                background:#2563eb;
                                color:white;
                                text-decoration:none;
                                border-radius:6px;
                            "
                        >
                            Reset Password
                        </a>
                    </p>

                    <p>
                        This link will expire in <strong>15 minutes</strong>.
                    </p>

                    <p>
                        If you did not request a password reset, you can ignore this email.
                    </p>

                    <p>
                        Regards,<br>
                        TradeX Team
                    </p>
                </div>
            `
        });

        console.log("Password reset email sent to:", user.email);

        res.status(200).json({
            message: "If an account exists with this email, a password reset link has been sent."
        });

    } catch (error) {
        console.error("Forgot password error:", error);

        res.status(500).json({
            message: "Unable to process password reset request."
        });
    }
});

            // ==========================================
    // PROTECTED USER PROFILE
    // ==========================================

    app.get("/api/profile", authenticateToken, async (req, res) => {
        try {
            const { ObjectId } = require("mongodb");

            const user = await usersCollection.findOne(
                {
                    _id: new ObjectId(req.user.userId)
                },
                {
                    projection: {
                        passwordHash: 0
                    }
                }
            );

            if (!user) {
                return res.status(404).json({
                    message: "User not found."
                });
            }

            res.json({
                message: "Authentication successful!",
                user: user
            });

        } catch (error) {
            console.error("Profile error:", error);

            res.status(500).json({
                message: "Something went wrong."
            });
        }
    });






    // ==========================================
// VIRTUAL WALLET
// ==========================================

app.get("/api/wallet", authenticateToken, async (req, res) => {
    try {
        const { ObjectId } = require("mongodb");

        const user = await usersCollection.findOne(
            {
                _id: new ObjectId(req.user.userId)
            },
            {
                projection: {
                    name: 1,
                    email: 1,
                    virtualBalance: 1
                }
            }
        );

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        res.json({
            message: "Wallet fetched successfully!",
            wallet: {
                userId: user._id,
                name: user.name,
                email: user.email,
                cashBalance: user.virtualBalance,
                currency: "INR"
            }
        });

    } catch (error) {
        console.error("Wallet error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});








// ==========================================
// ADD TEST STOCK
// ==========================================

app.post("/api/stocks/test", async (req, res) => {
    try {
        const testStock = {
            symbol: "RELIANCE",
            companyName: "Reliance Industries",
            exchange: "NSE",
            currentPrice: 1400,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const existingStock = await stocksCollection.findOne({
            symbol: testStock.symbol
        });

        if (existingStock) {
            return res.status(409).json({
                message: "Stock already exists."
            });
        }

        const result = await stocksCollection.insertOne(testStock);

        res.status(201).json({
            message: "Test stock added successfully!",
            stockId: result.insertedId
        });

    } catch (error) {
        console.error("Stock error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});





// ==========================================
// ADD NIFTY & BANKNIFTY
// ==========================================

app.post("/api/stocks/add-indexes", authenticateToken, async (req, res) => {
    try {

        const indexes = [
            {
                symbol: "NIFTY",
                companyName: "NIFTY 50",
                exchange: "NSE",
                currentPrice: 25000,
                previousClose: 24900
            },
            {
                symbol: "BANKNIFTY",
                companyName: "NIFTY BANK",
                exchange: "NSE",
                currentPrice: 56000,
                previousClose: 55800
            }
        ];

        let added = 0;

        for (const index of indexes) {

            const existing = await stocksCollection.findOne({
                symbol: index.symbol
            });

            if (existing) {
                continue;
            }

            await stocksCollection.insertOne({
                ...index,
                createdAt: new Date(),
                updatedAt: new Date()
            });

            added++;
        }

        res.status(201).json({
            message: "Indexes added successfully!",
            addedCount: added
        });

    } catch (error) {

        console.error("Add indexes error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});


// ==========================================
// GET ALL STOCKS
// ==========================================

app.get("/api/stocks", async (req, res) => {
    try {
       const stocks = await stocksCollection
    .find({})
    .sort({ symbol: 1 })
    .toArray();

const stocksWithChange = stocks.map(stock => {

    const currentPrice = Number(stock.currentPrice);
    const previousClose = Number(stock.previousClose);

    let change = 0;
    let changePercent = 0;

    if (
        Number.isFinite(currentPrice) &&
        Number.isFinite(previousClose) &&
        previousClose > 0
    ) {
        change = currentPrice - previousClose;

        changePercent =
            (change / previousClose) * 100;
    }

    return {
        ...stock,
        change: Number(change.toFixed(2)),
        changePercent: Number(changePercent.toFixed(2))
    };
});
        res.json({
            message: "Stocks fetched successfully!",
          stocks: stocksWithChange
        });

    } catch (error) {
        console.error("Get stocks error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});





// ==========================================
// VIRTUAL BUY ORDER
// ==========================================

app.post("/api/orders/buy", authenticateToken, async (req, res) => {
    try {
        const { symbol, quantity } = req.body;

        // 1. Validate input
        if (!symbol || quantity === undefined || quantity === null) {
            return res.status(400).json({
                message: "Symbol and quantity are required."
            });
        }

        const buyQuantity = Number(quantity);

        if (!Number.isInteger(buyQuantity) || buyQuantity <= 0) {
            return res.status(400).json({
                message: "Quantity must be a positive whole number."
            });
        }

        const normalizedSymbol = symbol.toUpperCase().trim();

        // 2. Find stock
        const stock = await stocksCollection.findOne({
            symbol: normalizedSymbol
        });

        if (!stock) {
            return res.status(404).json({
                message: "Stock not found."
            });
        }

        // 3. Get user
        const { ObjectId } = require("mongodb");

        const user = await usersCollection.findOne({
            _id: new ObjectId(req.user.userId)
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        // 4. Calculate order value
        const price = Number(stock.currentPrice);
        const totalCost = price * buyQuantity;

        // 5. Check virtual balance
        if (user.virtualBalance < totalCost) {
            return res.status(400).json({
                message: "Insufficient virtual balance.",
                required: totalCost,
                available: user.virtualBalance
            });
        }

        // 6. Deduct virtual money
        const newBalance = user.virtualBalance - totalCost;

        await usersCollection.updateOne(
            {
                _id: new ObjectId(req.user.userId)
            },
            {
                $set: {
                    virtualBalance: newBalance,
                    updatedAt: new Date()
                }
            }
        );

        // 7. Check existing holding
        const existingHolding = await holdingsCollection.findOne({
            userId: new ObjectId(req.user.userId),
            symbol: normalizedSymbol
        });

        if (existingHolding) {

            const oldQuantity = existingHolding.quantity;
            const oldInvestedAmount = existingHolding.investedAmount;

            const newQuantity = oldQuantity + buyQuantity;
            const newInvestedAmount = oldInvestedAmount + totalCost;

            const newAveragePrice =
                newInvestedAmount / newQuantity;

            await holdingsCollection.updateOne(
                {
                    _id: existingHolding._id
                },
                {
                    $set: {
                        quantity: newQuantity,
                        averagePrice: newAveragePrice,
                        investedAmount: newInvestedAmount,
                        updatedAt: new Date()
                    }
                }
            );

        } else {

            // Create new holding
            await holdingsCollection.insertOne({
                userId: new ObjectId(req.user.userId),
                symbol: normalizedSymbol,
                companyName: stock.companyName,
                exchange: stock.exchange,
                quantity: buyQuantity,
                averagePrice: price,
                investedAmount: totalCost,
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }

        // 8. Save order
        const order = {
            userId: new ObjectId(req.user.userId),
            symbol: normalizedSymbol,
            orderType: "BUY",
            quantity: buyQuantity,
            price: price,
            totalAmount: totalCost,
            status: "COMPLETED",
            createdAt: new Date()
        };

        const orderResult = await ordersCollection.insertOne(order);

        // 9. Response
        res.status(201).json({
            message: "Virtual buy order completed successfully!",
            order: {
                orderId: orderResult.insertedId,
                symbol: normalizedSymbol,
                quantity: buyQuantity,
                price: price,
                totalAmount: totalCost,
                remainingBalance: newBalance
            }
        });

    } catch (error) {

        console.error("Buy order error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});










// ==========================================
// GET USER PORTFOLIO
// ==========================================

app.get("/api/portfolio", authenticateToken, async (req, res) => {
    try {
        const { ObjectId } = require("mongodb");

        const holdings = await holdingsCollection
            .find({
                userId: new ObjectId(req.user.userId)
            })
            .sort({ symbol: 1 })
            .toArray();

        res.json({
            message: "Portfolio fetched successfully!",
            portfolio: holdings
        });

    } catch (error) {
        console.error("Portfolio error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});




// ==========================================
// RESET PASSWORD USING TOKEN
// ==========================================

app.post("/api/reset-password", async (req, res) => {
    try {

        const { token, newPassword } = req.body;


        // Check required fields
        if (!token || !newPassword) {
            return res.status(400).json({
                message: "Reset token and new password are required."
            });
        }


        // Password length
        if (newPassword.length < 6) {
            return res.status(400).json({
                message: "Password must be at least 6 characters."
            });
        }


        // Find user using reset token
       const tokenHash = crypto
    .createHash("sha256")
    .update(token)
    .digest("hex");

const user = await usersCollection.findOne({
    resetTokenHash: tokenHash,
    resetTokenExpiry: {
        $gt: new Date()
    }
});


        // Invalid or expired token
        if (!user) {
            return res.status(400).json({
                message: "Invalid or expired password reset link."
            });
        }


        // Hash new password
        const passwordHash =
            await bcrypt.hash(newPassword, 10);


        // Update password and remove reset token
        const result =
            await usersCollection.updateOne(
                {
                    _id: user._id
                },
                {
                    $set: {
                        passwordHash: passwordHash,
                        updatedAt: new Date()
                    },

                    $unset: {
                      resetTokenHash: "",
                resetTokenExpiry: ""
                    }
                }
            );


        if (result.modifiedCount === 0) {
            return res.status(500).json({
                message: "Password could not be updated."
            });
        }


        res.status(200).json({
            message: "Password reset successful!"
        });


    } catch (error) {

        console.error(
            "Reset password error:",
            error
        );


        res.status(500).json({
            message: "Something went wrong."
        });

    }
});








// ==========================================
// VIRTUAL SELL ORDER
// ==========================================

app.post("/api/orders/sell", authenticateToken, async (req, res) => {
    try {
        const { symbol, quantity } = req.body;

        // 1. Validate input
        if (!symbol || quantity === undefined || quantity === null) {
            return res.status(400).json({
                message: "Symbol and quantity are required."
            });
        }

        const sellQuantity = Number(quantity);

        if (!Number.isInteger(sellQuantity) || sellQuantity <= 0) {
            return res.status(400).json({
                message: "Quantity must be a positive whole number."
            });
        }

        const normalizedSymbol = symbol.toUpperCase().trim();

        const { ObjectId } = require("mongodb");
        const userId = new ObjectId(req.user.userId);

        // 2. Find stock
        const stock = await stocksCollection.findOne({
            symbol: normalizedSymbol
        });

        if (!stock) {
            return res.status(404).json({
                message: "Stock not found."
            });
        }

        // 3. Find user's holding
        const holding = await holdingsCollection.findOne({
            userId: userId,
            symbol: normalizedSymbol
        });

        if (!holding) {
            return res.status(400).json({
                message: "You do not own this stock."
            });
        }

        // 4. Check quantity
        if (holding.quantity < sellQuantity) {
            return res.status(400).json({
                message: "Insufficient shares.",
                owned: holding.quantity,
                requested: sellQuantity
            });
        }

        // 5. Current market price
        const price = Number(stock.currentPrice);

        // 6. Calculate sale value
        const totalAmount = price * sellQuantity;

        // 7. Calculate remaining holding
        const remainingQuantity =
            holding.quantity - sellQuantity;

        // 8. Calculate cost of shares being sold
        const costOfSoldShares =
            holding.averagePrice * sellQuantity;

        // 9. Realized P&L
        const realizedPnL =
            totalAmount - costOfSoldShares;

        // 10. Add sale money to virtual balance
        const user = await usersCollection.findOne({
            _id: userId
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        const newBalance =
            user.virtualBalance + totalAmount;

        await usersCollection.updateOne(
            {
                _id: userId
            },
            {
                $set: {
                    virtualBalance: newBalance,
                    updatedAt: new Date()
                }
            }
        );

        // 11. Update or remove holding
        if (remainingQuantity === 0) {

            await holdingsCollection.deleteOne({
                _id: holding._id
            });

        } else {

            const remainingInvestedAmount =
                holding.averagePrice * remainingQuantity;

            await holdingsCollection.updateOne(
                {
                    _id: holding._id
                },
                {
                    $set: {
                        quantity: remainingQuantity,
                        investedAmount: remainingInvestedAmount,
                        updatedAt: new Date()
                    }
                }
            );
        }

        // 12. Save SELL order
        const order = {
            userId: userId,
            symbol: normalizedSymbol,
            orderType: "SELL",
            quantity: sellQuantity,
            price: price,
            totalAmount: totalAmount,
            costBasis: costOfSoldShares,
            realizedPnL: realizedPnL,
            status: "COMPLETED",
            createdAt: new Date()
        };

        const orderResult =
            await ordersCollection.insertOne(order);

        // 13. Response
        res.status(201).json({
            message: "Virtual sell order completed successfully!",
            order: {
                orderId: orderResult.insertedId,
                symbol: normalizedSymbol,
                quantity: sellQuantity,
                price: price,
                totalAmount: totalAmount,
                realizedPnL: realizedPnL,
                remainingQuantity: remainingQuantity,
                remainingBalance: newBalance
            }
        });

    } catch (error) {

        console.error("Sell order error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});






// ==========================================
// GET ORDER HISTORY
// ==========================================

app.get("/api/orders", authenticateToken, async (req, res) => {
    try {
        const { ObjectId } = require("mongodb");

        const orders = await ordersCollection
            .find({
                userId: new ObjectId(req.user.userId)
            })
            .sort({ createdAt: -1 })
            .toArray();

        res.json({
            message: "Order history fetched successfully!",
            orders: orders
        });

    } catch (error) {
        console.error("Order history error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});






// ==========================================
// GET PORTFOLIO P&L
// ==========================================

app.get("/api/portfolio/pnl", authenticateToken, async (req, res) => {
    try {
        const { ObjectId } = require("mongodb");

        const userId = new ObjectId(req.user.userId);

        // Get user
        const user = await usersCollection.findOne({
            _id: userId
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        // Get holdings
        const holdings = await holdingsCollection
            .find({
                userId: userId
            })
            .toArray();

        let totalInvested = 0;
        let currentPortfolioValue = 0;
        let totalUnrealizedPnL = 0;

        const portfolio = [];

        for (const holding of holdings) {

            // Find current stock price
            const stock = await stocksCollection.findOne({
                symbol: holding.symbol
            });

            if (!stock) {
                continue;
            }

            const currentPrice = Number(stock.currentPrice);

            const currentValue =
                currentPrice * holding.quantity;

            const unrealizedPnL =
                currentValue - holding.investedAmount;

            totalInvested += holding.investedAmount;
            currentPortfolioValue += currentValue;
            totalUnrealizedPnL += unrealizedPnL;

           portfolio.push({
                  symbol: holding.symbol,
                  companyName: holding.companyName,
                  quantity: holding.quantity,
                  averagePrice: roundMoney(holding.averagePrice),
                  currentPrice: roundMoney(currentPrice),
                  investedAmount: roundMoney(holding.investedAmount),
                 currentValue: roundMoney(currentValue),
                 unrealizedPnL: roundMoney(unrealizedPnL)
             });
        }

        // Get realized P&L from completed SELL orders
        const sellOrders = await ordersCollection
            .find({
                userId: userId,
                orderType: "SELL",
                status: "COMPLETED"
            })
            .toArray();

        let realizedPnL = 0;

        for (const order of sellOrders) {
            realizedPnL += Number(order.realizedPnL || 0);
        }

        // Total P&L
        const totalPnL =
            realizedPnL + totalUnrealizedPnL;

        // Total account value
        const totalAccountValue =
          user.virtualBalance + currentPortfolioValue;

        res.json({
            message: "Portfolio P&L fetched successfully!",

            summary: {
                  cashBalance: roundMoney(user.virtualBalance),
                  investedAmount: roundMoney(totalInvested),
                  currentPortfolioValue: roundMoney(currentPortfolioValue),
                 realizedPnL: roundMoney(realizedPnL),
                 unrealizedPnL: roundMoney(totalUnrealizedPnL),
                  totalPnL: roundMoney(totalPnL),
                 totalAccountValue: roundMoney(totalAccountValue)
            },

            portfolio: portfolio
        });

    } catch (error) {

        console.error("Portfolio P&L error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});




// ==========================================
// GET MARKET STOCKS
// ==========================================

app.get("/api/market/stocks", authenticateToken, async (req, res) => {
    try {
        const stocks = await stocksCollection
            .find({})
            .sort({ symbol: 1 })
            .toArray();

        res.json({
            message: "Market stocks fetched successfully!",
            stocks: stocks
        });

    } catch (error) {
        console.error("Market stocks error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});



// ==========================================
// ADD STOCK
// ==========================================

app.post("/api/stocks", authenticateToken, async (req, res) => {
    try {
        const {
            symbol,
            companyName,
            exchange,
            currentPrice
        } = req.body;

        // Validate required fields
        if (!symbol || !companyName || !exchange || currentPrice === undefined) {
            return res.status(400).json({
                message: "Symbol, company name, exchange and current price are required."
            });
        }

        const normalizedSymbol = symbol.toUpperCase().trim();
        const price = Number(currentPrice);

        if (!Number.isFinite(price) || price <= 0) {
            return res.status(400).json({
                message: "Current price must be a positive number."
            });
        }

        // Check duplicate stock
        const existingStock = await stocksCollection.findOne({
            symbol: normalizedSymbol
        });

        if (existingStock) {
            return res.status(409).json({
                message: "Stock already exists."
            });
        }

        // Create stock
      const newStock = {
    symbol: normalizedSymbol,
    companyName: companyName.trim(),
    exchange: exchange.toUpperCase().trim(),
    currentPrice: price,
    previousClose: price,
    createdAt: new Date(),
    updatedAt: new Date()
};

        const result = await stocksCollection.insertOne(newStock);

        res.status(201).json({
            message: "Stock added successfully!",
            stockId: result.insertedId
        });

    } catch (error) {
        console.error("Add stock error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});


// ==========================================
// BULK ADD STOCKS
// ==========================================

app.post("/api/stocks/bulk", authenticateToken, async (req, res) => {
    try {
        const { stocks } = req.body;

        if (!Array.isArray(stocks) || stocks.length === 0) {
            return res.status(400).json({
                message: "Stocks array is required."
            });
        }

        const stocksToInsert = [];

        for (const stock of stocks) {
            const {
                symbol,
                companyName,
                exchange,
                currentPrice
            } = stock;

            if (
                !symbol ||
                !companyName ||
                !exchange ||
                currentPrice === undefined
            ) {
                continue;
            }

            const normalizedSymbol = symbol.toUpperCase().trim();

            const existingStock = await stocksCollection.findOne({
                symbol: normalizedSymbol
            });

            if (existingStock) {
                continue;
            }

            stocksToInsert.push({
                symbol: normalizedSymbol,
                companyName: companyName.trim(),
                exchange: exchange.toUpperCase().trim(),
                currentPrice: Number(currentPrice),
                previousClose: Number(currentPrice),
                createdAt: new Date(),
                updatedAt: new Date()
            });
        }

        if (stocksToInsert.length === 0) {
            return res.status(409).json({
                message: "No new stocks to add."
            });
        }

        const result = await stocksCollection.insertMany(
            stocksToInsert
        );

        res.status(201).json({
            message: "Stocks added successfully!",
            addedCount: result.insertedCount,
            stocks: stocksToInsert
        });

    } catch (error) {
        console.error("Bulk stock error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});





// ==========================================
// SEARCH STOCKS
// ==========================================

app.get("/api/stocks/search", authenticateToken, async (req, res) => {
    try {
        const query = req.query.query;

        if (!query || !query.trim()) {
            return res.status(400).json({
                message: "Search query is required."
            });
        }

        const searchQuery = query.trim();

        const stocks = await stocksCollection
            .find({
                $or: [
                    {
                        symbol: {
                            $regex: searchQuery,
                            $options: "i"
                        }
                    },
                    {
                        companyName: {
                            $regex: searchQuery,
                            $options: "i"
                        }
                    }
                ]
            })
            .project({
                symbol: 1,
                companyName: 1,
                exchange: 1,
                currentPrice: 1
            })
            .limit(20)
            .toArray();

        res.status(200).json({
            message: "Stocks search successful!",
            stocks: stocks
        });

    } catch (error) {
        console.error("Search stocks error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});


// ==========================================
// GET SINGLE STOCK
// ==========================================

app.get("/api/stocks/:symbol", authenticateToken, async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase().trim();

        const stock = await stocksCollection.findOne({
            symbol: symbol
        });

        if (!stock) {
            return res.status(404).json({
                message: "Stock not found."
            });
        }

        res.json({
            message: "Stock fetched successfully!",
            stock: stock
        });

    } catch (error) {
        console.error("Stock details error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});



// ==========================================
// UPDATE STOCK PRICE
// ==========================================

app.patch("/api/stocks/:symbol/price", authenticateToken, async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase().trim();
        const { currentPrice } = req.body;

        const price = Number(currentPrice);

        if (!Number.isFinite(price) || price <= 0) {
            return res.status(400).json({
                message: "Current price must be a positive number."
            });
        }

        const result = await stocksCollection.updateOne(
            {
                symbol: symbol
            },
            {
                $set: {
                    currentPrice: price,
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                message: "Stock not found."
            });
        }

        res.json({
            message: "Stock price updated successfully!",
            symbol: symbol,
            currentPrice: price
        });

    } catch (error) {
        console.error("Stock price update error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});



// ==========================================
// ADD DEMO PREVIOUS CLOSE
// ==========================================

app.patch("/api/stocks/:symbol/previous-close", authenticateToken, async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase().trim();
        const { previousClose } = req.body;

        const closePrice = Number(previousClose);

        if (!Number.isFinite(closePrice) || closePrice <= 0) {
            return res.status(400).json({
                message: "Previous close must be a positive number."
            });
        }

        const result = await stocksCollection.updateOne(
            {
                symbol: symbol
            },
            {
                $set: {
                    previousClose: closePrice,
                    updatedAt: new Date()
                }
            }
        );

        if (result.matchedCount === 0) {
            return res.status(404).json({
                message: "Stock not found."
            });
        }

        res.json({
            message: "Previous close updated successfully!",
            symbol: symbol,
            previousClose: closePrice
        });

    } catch (error) {
        console.error("Previous close update error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});


// ==========================================
// UPDATE ALL DEMO PREVIOUS CLOSE PRICES
// ==========================================

app.patch("/api/stocks/update-previous-closes", authenticateToken, async (req, res) => {
    try {

        const previousCloses = {
            BANKNIFTY: 55800,
            BHARTIARTL: 2600,
            HDFCBANK: 2040,
            ICICIBANK: 1270,
            INFY: 1200,
            ITC: 385,
            NIFTY: 24900,
            RELIANCE: 770,
            SBIN: 625,
            TCS: 2450
        };

        let updatedCount = 0;

        for (const [symbol, previousClose] of Object.entries(previousCloses)) {

            const result = await stocksCollection.updateOne(
                {
                    symbol: symbol
                },
                {
                    $set: {
                        previousClose: previousClose,
                        updatedAt: new Date()
                    }
                }
            );

            if (result.matchedCount > 0) {
                updatedCount++;
            }
        }

        res.json({
            message: "All previous close prices updated successfully!",
            updatedCount: updatedCount
        });

    } catch (error) {

        console.error("Bulk previous close update error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});
// ==========================================
// ADD STOCK TO WATCHLIST
// ==========================================

app.post("/api/watchlist/add", authenticateToken, async (req, res) => {
    try {
        const { symbol } = req.body;

        if (!symbol) {
            return res.status(400).json({
                message: "Symbol is required."
            });
        }

        const normalizedSymbol = symbol.toUpperCase().trim();

        // Check stock exists
        const stock = await database.collection("stocks").findOne({
            symbol: normalizedSymbol
        });

        if (!stock) {
            return res.status(404).json({
                message: "Stock not found."
            });
        }

        // Check already in watchlist
        const existingItem = await watchlistCollection.findOne({
            userId: req.user.userId,
            symbol: normalizedSymbol
        });

        if (existingItem) {
            return res.status(409).json({
                message: "Stock already exists in watchlist."
            });
        }

        const watchlistItem = {
            userId: req.user.userId,
            symbol: stock.symbol,
            companyName: stock.companyName,
            exchange: stock.exchange,
            currentPrice: stock.currentPrice,
            createdAt: new Date(),
            updatedAt: new Date()
        };

        const result = await watchlistCollection.insertOne(watchlistItem);

        res.status(201).json({
            message: "Stock added to watchlist successfully!",
            watchlistId: result.insertedId
        });

    } catch (error) {
        console.error("Add watchlist error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});




// ==========================================
// GET USER WATCHLIST
// ==========================================

// ==========================================
// GET USER WATCHLIST WITH LIVE STOCK PRICE
// ==========================================

app.get("/api/watchlist", authenticateToken, async (req, res) => {
    try {
        const watchlistItems = await watchlistCollection
            .find({
                userId: req.user.userId
            })
            .sort({
                createdAt: -1
            })
            .toArray();

        const watchlist = [];

        for (const item of watchlistItems) {

            const stock = await stocksCollection.findOne({
                symbol: item.symbol
            });

            if (!stock) {
                continue;
            }

            watchlist.push({
                symbol: stock.symbol,
                companyName: stock.companyName,
                exchange: stock.exchange,
                currentPrice: Number(stock.currentPrice)
            });
        }

        res.status(200).json({
            message: "Watchlist fetched successfully!",
            watchlist: watchlist
        });

    } catch (error) {
        console.error("Get watchlist error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});










// ==========================================
// REMOVE STOCK FROM WATCHLIST
// ==========================================

app.delete("/api/watchlist/remove/:symbol", authenticateToken, async (req, res) => {
    try {
        const symbol = req.params.symbol.toUpperCase().trim();

        const result = await watchlistCollection.deleteOne({
            userId: req.user.userId,
            symbol: symbol
        });

        if (result.deletedCount === 0) {
            return res.status(404).json({
                message: "Stock not found in watchlist."
            });
        }

        res.status(200).json({
            message: "Stock removed from watchlist successfully!"
        });

    } catch (error) {
        console.error("Remove watchlist error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});





// ==========================================
// DASHBOARD SUMMARY
// ==========================================

app.get("/api/dashboard", authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;

        // Get user
        const user = await usersCollection.findOne({
            _id: new ObjectId(userId)
        });

        if (!user) {
            return res.status(404).json({
                message: "User not found."
            });
        }

        // Get portfolio
        const portfolio = await holdingsCollection.find({
            userId: new ObjectId(userId)
        }).toArray();

        // Calculate portfolio value
        let currentPortfolioValue = 0;
        let totalInvested = 0;
        let unrealizedPnL = 0;

        for (const holding of portfolio) {

            const stock = await stocksCollection.findOne({
                symbol: holding.symbol
            });

            if (!stock) {
                continue;
            }

            const currentPrice = Number(stock.currentPrice);
            const currentValue = holding.quantity * currentPrice;

            currentPortfolioValue += currentValue;
            totalInvested += holding.investedAmount;

            unrealizedPnL += currentValue - holding.investedAmount;
        }

        // Get completed orders
           const orders = await ordersCollection.find({
                userId: new ObjectId(userId),
                status: "COMPLETED"
           }).toArray();

        let realizedPnL = 0;

        for (const order of orders) {
            if (order.orderType === "SELL") {
                realizedPnL += Number(order.realizedPnL || 0);
            }
        }

        const totalPnL = realizedPnL + unrealizedPnL;
        const totalAccountValue =
            Number(user.virtualBalance) + currentPortfolioValue;

        res.status(200).json({
            message: "Dashboard fetched successfully!",
            dashboard: {
                cashBalance: Number(user.virtualBalance.toFixed(2)),
                investedAmount: Number(totalInvested.toFixed(2)),
                portfolioValue: Number(currentPortfolioValue.toFixed(2)),
                realizedPnL: Number(realizedPnL.toFixed(2)),
                unrealizedPnL: Number(unrealizedPnL.toFixed(2)),
                totalPnL: Number(totalPnL.toFixed(2)),
                totalAccountValue: Number(totalAccountValue.toFixed(2)),
                holdingsCount: portfolio.length,
                ordersCount: orders.length
            }
        });

    } catch (error) {
        console.error("Dashboard error:", error);

        res.status(500).json({
            message: "Something went wrong."
        });
    }
});





updateSimulatedPrices();

setInterval(updateSimulatedPrices, 3000);


// mail 
app.get("/api/test-email", async (req, res) => {
    try {
        const testEmail = req.query.email;

        if (!testEmail) {
            return res.status(400).json({
                message: "Email query parameter is required."
            });
        }

        const info = await emailTransporter.sendMail({
            from: `"TradeX" <${process.env.EMAIL_USER}>`,
            to: testEmail,
            subject: "TradeX Email Test",
            text: "This is a test email from your TradeX paper trading application."
        });

        console.log("Test email sent:", info.messageId);

        res.json({
            message: "Test email sent successfully!",
            messageId: info.messageId
        });

    } catch (error) {
        console.error("Email sending error:", error);

        res.status(500).json({
            message: "Email sending failed.",
            error: error.message
        });
    }
});



        // ==========================================
        // START SERVER
        // ==========================================

        app.listen(PORT, () => {
            console.log(`Server running at http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error("MongoDB connection failed:", error);
    }
}

startServer();