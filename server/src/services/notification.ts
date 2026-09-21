import { Role } from '@prisma/client';
import {prisma} from '../utils/prisma.js';

// Lock-screen-safe: no patient name/MRN/DOB/diagnosis/medication.
export async function notifyNurse(userId:number,requestId:number,status:string,eta?:Date|null,courier?:string|null){
  const safe=status==='OUT_FOR_DELIVERY'
    ? `Your pharmacy request is out for delivery. Courier: ${courier||'assigned'}. ETA: ${eta?eta.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}):'pending'}.`
    : `Your pharmacy request status changed to ${status.replaceAll('_',' ').toLowerCase()}.`;
  return prisma.notification.create({data:{userId,requestId,title:'Medication Request Update',message:safe}});
}

export async function notifyPharmacistsNewRequest(requestId:number,requestNo:string,priority:string){
  const pharmacists=await prisma.user.findMany({where:{role:Role.PHARMACIST},select:{id:true}});
  if(!pharmacists.length) return;
  await prisma.notification.createMany({data:pharmacists.map(p=>({userId:p.id,requestId,title:'New Pharmacy Request',message:`${requestNo} is waiting in the pharmacy queue. Priority: ${priority}.`}))});
}
