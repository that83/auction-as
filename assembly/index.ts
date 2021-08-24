import { logging, Context, u128, ContractPromiseBatch, PersistentMap, datetime } from "near-sdk-as";
export const toYoctoN = u128.from("1000000000000000000000000"); // multiply 10^24 to convert NEAR to YoctoN
export const XCC_GAS: u64 = 20_000_000_000_000;
  // --------------------------------------------------------------------------
  // AUCTION
  // --------------------------------------------------------------------------

  /**
   * "Rule"
   * Seller deploys contract
   * Seller calls init function to set owner, reservePrice, bidIncrement, timeout
   * Bidder calls bid() function and attach <price> in NEAR to bid:
   *      bidValue must >= reservePrice
   *      bidValue must > highestbid + bidIncrement
   *      if bidValue >= expectedSellPrice then bidder becomes winner instantly.
   * SellPrice = the 2nd highest bidder's bid value + bidIncrement
   * If there is winner, Contract will be inactived. 
   * Only owner could call reset() function to reset auction.
   */
@nearBindgen
export class Contract {
  //const toYoctoN = u128.from("1000000000000000000000000"); // multiply 10^24 to convert NEAR to YoctoN

  private owner: string = "";
  private winner: string = "";
  private sellPrice: u128 = u128.Zero;
  private highestBid: u128 = u128.Zero;
  private highestBider: string = "";

  private description: string = "";
  private expectedSellPrice: u128 = u128.Zero;  //If expectedSellPrice != 0, the bidder has bid >= expectedSellPrice will win instantly
  private bidIncrement: u128 = toYoctoN;        //The amount (in NEAR) by which the auctioneer increases the bidding ( >= is acceptable)
  private reservePrice: u128 = toYoctoN;       //If bidding ends before the reserve (in NEAR) is reached, the property will not be sold.
  private active: bool = false;                 //Status of current bid
  private startAt: string = "";
  private endAt: string = "";
  private endTimestamp: u64;
  private players: PersistentMap<string, u128>;
  private playerArray: Array<string> = new Array<string>(0);

  //constructor(owner: string, reservePrice: number, bidIncrement: number, timeout:number) {
    constructor(owner: string) {
    //let players = new PersistentMap<string, string>("p");
    this.owner = owner;    

  };


      /**
     * Parametters:
     * reservePrice: in NEAR
     * bidIncrement: in NEAR
     * minutes: bid period of time in minute(s)
     *     
     *      
     *      
     * 
     * 
     * 
     */
      @mutateState()
    reset(owner: string, description: string, reservePrice: string, expectedSellPrice: string, bidIncrement: string, minutes: string): void {
      this.assert_self();
      //Todo: comment out when run live
      //assert(!this.active, "Status is Active so you can not Reset" );
      this.owner = owner;
      this.description = description;
      //this.reservePrice = <u128>(reservePrice*toYoctoN);
      this.reservePrice = u128.mul(toYoctoN, u128.from(reservePrice));
      //this.bidIncrement = <u128>(bidIncrement*toYoctoN);
      this.expectedSellPrice = u128.mul(toYoctoN, u128.from(expectedSellPrice));
      this.bidIncrement = u128.mul(toYoctoN, u128.from(bidIncrement));
      this.winner = "";
      
      this.active = true;
      //let players = new PersistentMap<string, string>("p");
      this.players = new PersistentMap<string, u128>("p")(0);
      this.playerArray = new Array<string>(0);

      //this.startAt = Context.blockTimestamp/1000000000; //cut off the milliseconds, microseconds and nanoseconds parts
      const startTimestamp = Context.blockTimestamp/1000000; //cut off the microseconds and nanoseconds parts
      //this.endAt = this.startAt + <u64>(minutes*60);
      //this.endAt = <u64>u128.add(u128.from(this.startAt),u128.mul(u128.from(minutes),u128.from(60)));
      const intMinutes = parseInt(minutes, 10);
      this.endTimestamp = startTimestamp + <u64>(intMinutes*60000); //60000 miliseconds, store this timestamp to compare later
      //this.startAt = new Date(startTimestamp).toString();
      const startDate = new Date(startTimestamp);
      this.startAt = startDate.toString();

      //this.endAt = new Date(this.endTimestamp).toString();
      const endDate = new Date(this.endTimestamp);
      this.endAt = endDate.toString();


      //logging.log(this.startAt);
      //logging.log(startTimestamp);
      //logging.log(this.endAt);
      //logging.log(this.endTimestamp);

      this.winner = "";
      this.highestBid = u128.Zero;
      this.highestBider = ""
      this.sellPrice = u128.Zero;

      //for test only
      this.players.delete("tonitran.testnet");
      this.players.delete("that83.testnet");
      this.players.delete("anybody.testnet");
      this.explain();
    
    };

    @mutateState()
    bid(): void {
      logging.log("1");
      assert(this.active, "This Auction is not active. Please come later at next auction!!" );
      const signer = Context.sender;
      var bidValue: u128 = u128.Zero;
      var isNewPlayer: bool;
     
      //Check if time is over?
      if (Context.blockTimestamp/1000000 > this.endTimestamp) {
        logging.log("Can not deposit since time is over!");
        //this.finallize();

        //todo check xem can mo lai cho nay ko?
        assert(false, "Time over!! Please come later at next auction!!" );
      
      } else {  //If in time
        //Calculate bid value
        
        // if you've bidded before
        if (this.players.contains(signer.toString())) {  
          logging.log("117");
          isNewPlayer = false;
          //const bidedValue = <u128>(this.players.get(signer));
          bidValue = u128.add(<u128>(this.players.get(signer)), Context.attachedDeposit);
          logging.log("bidValue:       " + bidValue.toString());

          
        } else { // if it's your first time bid
          isNewPlayer = true;
          logging.log("124");
          bidValue = Context.attachedDeposit;
          logging.log("playerArray: " + this.playerArray.length.toString());

          logging.log("playerArray: " + this.playerArray.length.toString());
          logging.log("bidValue:       " + bidValue.toString());
        }
        logging.log("132");
        logging.log("Caculating highest bid");
        //Calculate minimun bid value
        const minBid = u128.add(this.highestBid,this.bidIncrement) > this.reservePrice? u128.add(this.highestBid,this.bidIncrement): this.reservePrice;
        //If bid value < minbid, throw error and do not received money
        assert(bidValue >= minBid, "Bid value must be greater or equal to:" + minBid.toString());
        //In case of new player, add account name to Array
        if (isNewPlayer) {
          this.playerArray[this.playerArray.length]=signer;
        }
        //Set new bid value for this player
        this.players.set(signer, bidValue);
        this.highestBider = signer;
        this.highestBid = bidValue;
        logging.log("147");
          //todo: check logical here

          //If there is expectedSellPrice and bidValue >= expectedSellPrice
          if ((this.expectedSellPrice != u128.Zero) && (bidValue >= this.expectedSellPrice)) {

            //set sell price
            this.sellPrice = this.expectedSellPrice;
            //remember the redundance amount need to be pay back to winner.
            //this.players.set(signer, bidValue - this.sellPrice);  
            logging.log("Bid value > expectedSellPrice!! Finallizing....");
            this.active = false;
            this.finallize();
  
  
          } else {
            logging.log("158");
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
    finallize(): void {
      logging.log("Finallizing.... ");

      //Only finallize if "inactive" or "time over"
      assert(((!this.active) || (Context.blockTimestamp/1000000 > this.endTimestamp)), "Can not finallize since this auction is ACTIVE and TIME still not over" );

      if (this.winner != "") {
        logging.log(this.winner + " won! Going to transfer deposit back to other bidders");
      }
      this.winner = this.highestBider;
      logging.log("Calling payout to person not win");
      this.payout();
      this.active = false;
    }


  explain(): void {
    logging.log("Description:         " + this.description);
    logging.log("Owner:               " + this.owner);
    logging.log("Status:              " + this.active.toString());
    logging.log("Reserve Price:       " + (u128.div(this.reservePrice,toYoctoN)).toString() + " NEAR");
    logging.log("BidIncrement:        " + (u128.div(this.bidIncrement,toYoctoN)).toString() + " NEAR"); //this.bidIncrement.toString());
    logging.log("Expected Sell Price: " + (u128.div(this.expectedSellPrice,toYoctoN)).toString() + " NEAR"); //this.sellPrice.toString());
    logging.log("Started At:          " + this.startAt);
    logging.log("End At:              " + this.endAt);
    logging.log("*******************************************");
    logging.log("Sell Price:          " + (u128.div(this.sellPrice,toYoctoN)).toString() + " NEAR"); //this.sellPrice.toString());
    logging.log("Highest Bid:         " + (u128.div(this.highestBid,toYoctoN)).toString() + " NEAR"); //this.sellPrice.toString());
    logging.log("Highest Bidder:      " + this.highestBider);
    logging.log("Winner:              " + this.winner);
    logging.log("Player deposited:");
    for (let i = 0; i < this.playerArray.length; i++) {
      const tempPlayer = this.players.get(this.playerArray[i]);
      if (!(tempPlayer === null)) {
        logging.log("            " + this.playerArray[i] + " : " + (u128.div(tempPlayer,toYoctoN)).toString() + " NEAR");
      }
    }

    //For test only
    /*
    const tempU128 = this.players.get("tonitran.testnet");
    if (!(tempU128 === null)) {
      logging.log("Debug tonitran: bidded " + tempU128.toString() + " NEAR");
      }
   
    */
  }


 

  private payout(): void {


      /*
      //To do: loop all array to transfer back money
      this.playerArray.forEach((element, this.players) => {
        const to_player = ContractPromiseBatch.create(element);
        // transfer payout to each player
        to_player.transfer(this.players.get(element));
      });
      */
      const self = Context.contractName;
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
            logging.log("Transferred to " + player + ": " + deposit.toString() + " YoctoNEAR");
            //const paramString = "{\"player\":\"" + player + "\",\"deposit\":\"" + deposit.toString() + "\"}";
            //logging.log("paramString:" + paramString);
            // receive confirmation of payout before log
            //to_player.then(self).function_call("on_payout_complete", paramString, u128.Zero, XCC_GAS);
            
          }
          this.players.delete(player);
        }
      }
   
      // receive confirmation of payout 
      //to_player.then(self).function_call("on_payout_complete", "{}", u128.Zero, 1);
  }

   // this method is only here for the promise callback,
  // it should never be called directly
  @mutateState()
  on_payout_complete(player: string, deposit: string): void {
    this.assert_self();
    //this.active = false;
    logging.log("Transfered to " + player + ": " + deposit + " YoctoNEAR");

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
