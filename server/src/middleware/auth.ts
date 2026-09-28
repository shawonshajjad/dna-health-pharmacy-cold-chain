import type {Request,Response,NextFunction} from 'express';
import jwt from 'jsonwebtoken';
import {Role} from '@prisma/client';
export function auth(req:Request,res:Response,next:NextFunction){
 const header=req.headers.authorization;
 if(!header?.startsWith('Bearer '))return res.status(401).json({error:'Authentication required'});
 const token=header.slice(7).trim();
 if(!token)return res.status(401).json({error:'Authentication required'});
 try{
  const payload=jwt.verify(token,process.env.JWT_SECRET!,{issuer:'dna-pharmacy-api',audience:'dna-pharmacy-client',algorithms:['HS256']}) as any;
  if(!payload?.id||!payload?.role)return res.status(401).json({error:'Invalid token'});
  req.user=payload; next();
 }catch{return res.status(401).json({error:'Invalid token'});}
}
export const allow=(...roles:Role[])=>(req:Request,res:Response,next:NextFunction)=>req.user&&roles.includes(req.user.role)?next():res.status(403).json({error:'Forbidden'});
