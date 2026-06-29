import Wallet from '../models/WalletModel.js';
import Transaction from '../models/TransactionModel.js';

async function getWalletAmount(req, res) {
  try {
    const userId = req.user._id;
    const wallet = await Wallet.findOne({ userId });

    if (!wallet) {
      return res.status(400).json({
        success: false,
        message: "Wallet for this userId not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: wallet,
      message: "Wallet fetched successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
      error: error.message,
    });
  }
}

async function getTransactions(req, res) {
  try {
    const userId = req.user._id;
    const transactions = await Transaction.find({ 
      userId,
      type: { $nin: ["admin_fee", "deposit_brl", "withdrawal_brl"] } 
     }).populate(
      "campaignId",
      "campaignName campaignStrategy"
    )

    if (!transactions) {
      return res.status(400).json({
        success: false,
        message: "User transactions not found.",
      });
    }

    return res.status(200).json({
      success: true,
      data: transactions,
      message: "User all transactions retrieved successfully.",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Something went wrong.",
      error: error.message,
    });
  }
}

async function getAdminStats(req, res) {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();

    // Find the superadmin wallet
    const superadminWallet = await Wallet.findOne({ userType: "superadmin" });
    if (!superadminWallet) {
      return res.status(404).json({ message: "Superadmin wallet not found" });
    }

    // Aggregate transactions for this wallet, grouped by month
    const stats = await Transaction.aggregate([
      {
        $match: {
          walletId: superadminWallet._id,
          transactionCreatedFor: "superadmin",
          createdAt: {
            $gte: new Date(`${year}-01-01T00:00:00.000Z`),
            $lte: new Date(`${year}-12-31T23:59:59.999Z`),
          },
        },
      },
      {
        $group: {
          _id: { $month: "$createdAt" },
          total: { $sum: "$amount" },
        },
      },
      {
        $project: {
          month: "$_id",
          total: 1,
          _id: 0,
        },
      },
    ]);

    // Format result as an array of 12 months
    const monthlyStats = Array(12).fill(0);
    stats.forEach(({ month, total }) => {
      monthlyStats[month - 1] = total;
    });

    res.json({
      year,
      monthlyStats,
    });
  } catch (err) {
    res
      .status(500)
      .json({ message: "Internal server error", error: err.message });
  }
}


export {
    getWalletAmount,
    getTransactions,
    getAdminStats
}