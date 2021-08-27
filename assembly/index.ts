import { logging, Context, u128, ContractPromiseBatch, PersistentMap, datetime } from "near-sdk-as";
export const toYoctoN = u128.from("1000000000000000000000000"); // multiply 10^24 to convert NEAR to YoctoN
export const XCC_GAS: u64 = 20_000_000_000_000;

  // --------------------------------------------------------------------------
  // AUCTION
  // --------------------------------------------------------------------------

  /**
   *"AUCTION RULE:"
   * 1. Seller deploys Auction contract
   * 2. Seller calls init() function to set description, reservePrice, expectedSellPrice, bidIncrement, minutes
   *   reservePrice     : the lowest price acceptable by the seller for item sold.
   *   expectedSellPrice: price that seller accepts to sale item instantly.
   *   bidIncrement     : the minimum difference between the bid price value and the last highestBid.
   *                      Bid price value is NEAR(s) attached when bidders calling bid() function.
   *   minutes          : number of minute(s) that the auction will expired after being deployed.
   * 3. If time is over: bidders can not bid or transfer deposit.
   * 4. Bidder calls bid() function and attach NEAR as <bidValue> to deposit:
   *      bidValue must >= reservePrice
   *      bidValue must > highestBid + bidIncrement
   *      if bidValue >= expectedSellPrice then bidder becomes winner instantly with SellPrice = expectedSellPrice.
   * 5. SellPrice = the previous highest bid value + bidIncrement (Bidders are incentivized to bid the maximum they 
   *                are willing to pay, but they are not bound to that full amount)
   * 6. If there is a winner, Contract will be inactive.
   * 7. If time is over, anyone can call finalize() function to finalize the auction.
   * 8. Contract owner can keep only SellPrice from winner, the remain deposit will be pay back to bidders.
   * 9. Only account holding this contract could call init() and reset() function.
   */
@nearBindgen
export class Contract {
  private winner: string = "";
  private sellPrice: u128 = u128.Zero;
  private highestBid: u128 = u128.Zero;
  private highestBidder: string = "";
  private description: string = "";
  private expectedSellPrice: u128 = u128.Zero;  //in NEAR, Zero means this auction do not has expectedSellPrice 
  private bidIncrement: u128 = toYoctoN;        //in NEAR
  private reservePrice: u128 = toYoctoN;        //in NEAR
  private active: bool = false;                 //Status of this Auction
  private startAt: string = "";
  private endAt: string = "";
  private endTimestamp: u64;
  private players: PersistentMap<string, u128>;
  private playerArray: Array<string> = new Array<string>(0);

  constructor(description: string, reservePrice: string, expectedSellPrice: string, bidIncrement: string, minutes: string) {
    this.reset(description, reservePrice, expectedSellPrice, bidIncrement, minutes);
  };

   /**
   * Parametters:
   * reservePrice, expectedSellPrice, bidIncrement: in NEAR
   * minutes: how many minute(s) the Auction will active
   */
  @mutateState()
  reset(description: string, reservePrice: string, expectedSellPrice: string, bidIncrement: string, minutes: string): void {
    this.assert_self();
    assert(!this.active, "Status is Active so you can not Reset" );
    this.description = description;
    this.reservePrice = u128.mul(toYoctoN, u128.from(reservePrice));
    this.expectedSellPrice = u128.mul(toYoctoN, u128.from(expectedSellPrice));
    this.bidIncrement = u128.mul(toYoctoN, u128.from(bidIncrement));
    this.winner = "";
    this.active = true;
    this.players = new PersistentMap<string, u128>("p")(0);
    this.playerArray = new Array<string>(0);

    //cut off the microseconds and nanoseconds parts
    const startTimestamp = Context.blockTimestamp/1000000;
    const intMinutes = parseInt(minutes, 10);
    //1 minute = 60000 miliseconds, store this end timestamp to compare later
    this.endTimestamp = startTimestamp + <u64>(intMinutes*60000); 
    const startDate = new Date(startTimestamp);
    this.startAt = startDate.toString();
    const endDate = new Date(this.endTimestamp);
    this.endAt = endDate.toString();
    this.winner = "";
    this.highestBid = u128.Zero;
    this.highestBidder = ""
    this.sellPrice = u128.Zero;
    //print out the explaination of this Auction
    this.explain();    
  };

  @mutateState()
  bid(): void {
    assert(this.active, "This Auction is not active. Please come later at next auction!!" );
    const signer = Context.sender;
    var bidValue: u128 = u128.Zero;
    var isNewPlayer: bool;
    
    //Check if time is over?
    if (Context.blockTimestamp/1000000 > this.endTimestamp) {
      //Use assert to reject the deposit
      assert(false, "Can not bid and deposit since time is over!" );    
    } else {
      // if bidder've bidded before
      if (this.players.contains(signer.toString())) {  
        isNewPlayer = false;
        bidValue = u128.add(<u128>(this.players.get(signer)), Context.attachedDeposit);
      } else { // if it's his first time bid
        isNewPlayer = true;
        bidValue = Context.attachedDeposit;
      }
      //Calculate minimum bid value
      const minBid = u128.add(this.highestBid,this.bidIncrement) > this.reservePrice? u128.add(this.highestBid,this.bidIncrement): this.reservePrice;
      //If bid value < minbid, throw error and do not received money
      assert(bidValue >= minBid, "Bid value must be greater or equal to:" + (u128.div(minBid,toYoctoN)).toString() + " NEAR");
      
      //In case of new player, add account name to Array
      if (isNewPlayer) {
        //Add new player to this.playerArray
        this.playerArray[this.playerArray.length]=signer;
      }
      //Set new bid value for this player
      this.players.set(signer, bidValue);
      this.highestBidder = signer;
      this.highestBid = bidValue;
        //If there is expectedSellPrice and bidValue >= expectedSellPrice
        if ((this.expectedSellPrice != u128.Zero) && (bidValue >= this.expectedSellPrice)) {
          //set sell price
          this.sellPrice = this.expectedSellPrice;
          //remember the redundance amount need to be pay back to winner.
          logging.log("Bid value > expectedSellPrice!! Finallizing....");
          this.active = false;
          this.finalize();
        } else {
          this.sellPrice = minBid;          
        }
    }
    this.explain();
  };

  @mutateState()
  set_status(status: bool): bool {
    this.assert_self();
    this.active = status;
    return true;
  }

  @mutateState()
  finalize(): void {
    logging.log("Finalizing.... ");

    //Only finalize if status is "inactive" or auction is "time over"
    assert(((!this.active) || (Context.blockTimestamp/1000000 > this.endTimestamp)), "Can not finalize since this auction is ACTIVE and TIME still not over" );
    this.winner = this.highestBidder;
    if (this.winner != "") {
      logging.log(this.winner + " won! Going to transfer deposit back to other bidders");
    }
    logging.log("Going to paying back deposit");
    this.payout();
    this.active = false;
  }

  explain(): void {
    logging.log("Description:         " + this.description);
    logging.log("Status:              " + this.active.toString());
    logging.log("Reserve Price:       " + (u128.div(this.reservePrice,toYoctoN)).toString() + " NEAR");
    logging.log("Bid Increment:       " + (u128.div(this.bidIncrement,toYoctoN)).toString() + " NEAR");
    logging.log("Expected Sell Price: " + (u128.div(this.expectedSellPrice,toYoctoN)).toString() + " NEAR");
    logging.log("Started At:          " + this.startAt);
    logging.log("End At:              " + this.endAt);
    logging.log("*******************************************");
    logging.log("Sell Price:          " + (u128.div(this.sellPrice,toYoctoN)).toString() + " NEAR");
    logging.log("Highest Bid:         " + (u128.div(this.highestBid,toYoctoN)).toString() + " NEAR");
    logging.log("Highest Bidder:      " + this.highestBidder);
    logging.log("Winner:              " + this.winner);
    logging.log("Player deposited:");
    for (let i = 0; i < this.playerArray.length; i++) {
      const tempDeposit = this.players.get(this.playerArray[i]);
      if (!(tempDeposit === null)) {
        logging.log("            " + this.playerArray[i] + " : " + (u128.div(tempDeposit,toYoctoN)).toString() + " NEAR");
      }
    }
  }

  //Pay back all deposit to bidders
  private payout(): void {
    //For each player
    for (let i = 0; i < this.playerArray.length; i++) {
      const player =  this.playerArray[i];
      const to_player = ContractPromiseBatch.create(player);
      var deposit = this.players.get(player);
      if (!(deposit === null)) {          
        //In case of the winner, subtract sellPrice and pay back the remain deposit
        if (player == this.winner) {
          deposit = u128.sub(deposit,this.sellPrice);
        }
        if (deposit > u128.Zero) {
          //transfer deposit to each player            
          to_player.transfer(deposit);
          logging.log("Transferred to " + player + ": " + (u128.div(deposit,toYoctoN)).toString() + " NEAR");          
        }
        //Delete in players map to release storage
        this.players.delete(player);
      }
    }
  }

  // --------------------------------------------------------------------------
  // Private methods
  // --------------------------------------------------------------------------
  private assert_self(): void {
    const caller = Context.predecessor;
    const self = Context.contractName;
    assert(caller == self, "Only this contract may call itself");
  }
}
