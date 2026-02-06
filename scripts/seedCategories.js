const mongoose = require("mongoose");
const dotenv = require("dotenv");
const Stripe = require("stripe");

dotenv.config({ path: "./config.env" });

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

mongoose.connect(process.env.DATABASE);

async function deleteAllConnectedAccounts() {
  try {
    console.log("Fetching all connected accounts...");

    let allAccounts = [];
    let hasMore = true;
    let startingAfter = undefined;

    // Fetch all accounts (paginated)
    while (hasMore) {
      const accounts = await stripe.accounts.list({
        limit: 100,
        starting_after: startingAfter,
      });

      allAccounts = allAccounts.concat(accounts.data);
      hasMore = accounts.has_more;

      if (hasMore) {
        startingAfter = accounts.data[accounts.data.length - 1].id;
      }
    }

    console.log(`Found ${allAccounts.length} connected accounts\n`);

    if (allAccounts.length === 0) {
      console.log("No accounts to delete");
      process.exit();
      return;
    }

    // Show first few accounts
    console.log("Sample accounts to be deleted:");
    allAccounts.slice(0, 5).forEach((account) => {
      console.log(`  - ${account.id} (${account.email || "no email"})`);
    });

    if (allAccounts.length > 5) {
      console.log(`  ... and ${allAccounts.length - 5} more\n`);
    }

    // Delete each account
    let deletedCount = 0;
    let failedCount = 0;

    for (const account of allAccounts) {
      try {
        await stripe.accounts.del(account.id);
        deletedCount++;
        console.log(`✓ Deleted ${account.id}`);
      } catch (error) {
        failedCount++;
        console.error(`✗ Failed to delete ${account.id}:`, error.message);
      }
    }

    console.log(`\nDeletion completed:`);
    console.log(`  - Successfully deleted: ${deletedCount}`);
    console.log(`  - Failed: ${failedCount}`);

    process.exit();
  } catch (error) {
    console.error("Script failed:", error);
    process.exit(1);
  }
}

deleteAllConnectedAccounts();
