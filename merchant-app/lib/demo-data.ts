// Fictional customers and masked phone numbers for the merchant demo only.
export const demoCustomers = [
 ['Faith Wanjiku','0712 ••• 482'],['Brian Otieno','0723 ••• 916'],
 ['Grace Akinyi','0708 ••• 125'],['James Mwangi','0722 ••• 638'],
 ['Mary Wambui','0715 ••• 043'],['Kevin Mutua','0790 ••• 291'],
 ['Esther Njeri','0728 ••• 571'],['Peter Kamau','0710 ••• 308'],
 ['Sharon Atieno','0741 ••• 625'],['David Kiptoo','0724 ••• 887'],
 ['Alice Chebet','0701 ••• 492'],['Joseph Maina','0718 ••• 209'],
 ['Mercy Wairimu','0706 ••• 314'],['Dennis Ochieng','0716 ••• 728'],
 ['Lucy Nyambura','0726 ••• 861'],['Collins Omondi','0746 ••• 537'],
 ['Ruth Jepchirchir','0713 ••• 294'],['Samuel Karanja','0720 ••• 653'],
 ['Agnes Muthoni','0798 ••• 142'],['Victor Musyoka','0711 ••• 976'],
 ['Janet Wanjala','0704 ••• 381'],['Eric Kimani','0725 ••• 419'],
 ['Rose Adhiambo','0742 ••• 567'],['Paul Njuguna','0719 ••• 832'],
 ['Lilian Moraa','0709 ••• 215'],['Daniel Kariuki','0721 ••• 764'],
 ['Hellen Naliaka','0757 ••• 493'],['Isaac Ouma','0717 ••• 126'],
 ['Beatrice Achieng','0796 ••• 348'],['Francis Kiplagat','0702 ••• 659'],
 ['Cynthia Mumbi','0729 ••• 817'],['Patrick Wekesa','0745 ••• 273'],
 ['Winnie Nyokabi','0707 ••• 941'],['George Odhiambo','0714 ••• 586'],
 ['Caroline Wangari','0727 ••• 132'],['Anthony Barasa','0758 ••• 724'],
 ['Diana Chepkemoi','0795 ••• 368'],['Martin Muriuki','0703 ••• 852'],
 ['Ann Wanjiru','0748 ••• 617'],['Felix Omwenga','0759 ••• 239'],
] as const;
// Repeated fare amounts provide multiple matches; other amounts suit market purchases.
const amounts = [100,50,100,150,200,100,50,80,100,250,150,20,500,100,70,200,1000,50,120,2500];
export type DemoPayment = {receipt:string;name:string;phone:string;amount:number;received_at:number;claimed_at:number|null;claimed_for:string|null};
export function makeDemoPayments(batchId:string, now:number, count:number):DemoPayment[] {
 return Array.from({length:count},(_,i)=>{
  const customer=demoCustomers[i%demoCustomers.length];
  // Spread the batch over the previous 25 minutes, with no future transactions.
  const received=now-Math.round(i*25*60000/Math.max(1,count-1));
  const confirmed=i%5===4;
  return {receipt:`DEMO${batchId}-${String(i+1).padStart(3,'0')}`,name:customer[0],phone:customer[1],amount:amounts[i%amounts.length]*100,received_at:received,claimed_at:confirmed?Math.min(now,received+15000):null,claimed_for:confirmed?`${customer[0]} / ${i%2===0?'Seat '+(i%14+1):'Order '+(i+1)}`:null};
 });
}
