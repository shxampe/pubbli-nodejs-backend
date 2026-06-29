import express from 'express';
import { authenticate } from '../../middleware/authMiddleware.js';
import { 
    getWalletAmount, 
    getTransactions,
    getAdminStats
} from '../../controllers/Wallet.Contoller.js';

const router = express.Router();

// get wallet amount
router.get('/', authenticate, getWalletAmount);

// get transaction
router.get('/get-transactions', authenticate, getTransactions);

// get admin stats yearly
router.get('/superadmin/monthly-stats', getAdminStats)


export default router;