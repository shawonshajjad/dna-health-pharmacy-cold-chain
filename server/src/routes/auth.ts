import {Router} from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {z} from 'zod';
import {prisma} from '../utils/prisma.js';
const r=Router();
const attempts=new Map<string,{count:number;reset:number}>();
const WINDOW=15*60*1000, MAX=8;
r.post('/login',async(req,res)=>{
 const key=req.ip||'unknown', now=Date.now(), state=attempts.get(key);
 if(state&&state.reset>now&&state.count>=MAX)return res.status(429).json({error:'Too many login attempts. Try again later.'});
 const x=z.object({email:z.string().email().max(254),password:z.string().min(6).max(200)}).safeParse(req.body);
 if(!x.success)return res.status(400).json({error:'Invalid credentials format'});
 const u=await prisma.user.findUnique({where:{email:x.data.email.toLowerCase()}});
 if(!u||!await bcrypt.compare(x.data.password,u.passwordHash)){
  const current=state&&state.reset>now?state:{count:0,reset:now+WINDOW}; attempts.set(key,{count:current.count+1,reset:current.reset});
  return res.status(401).json({error:'Invalid email or password'});
 }
 attempts.delete(key);
 const user={id:u.id,name:u.name,email:u.email,role:u.role,ward:u.ward};
 const token=jwt.sign(user,process.env.JWT_SECRET!,{expiresIn:'8h',issuer:'dna-pharmacy-api',audience:'dna-pharmacy-client',subject:String(u.id)});
 res.json({token,user});
});
export default r;
