import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import authRoutes from './routes/auth.js';
import apiRoutes from './routes/api.js';

if(!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('replace-with')) throw new Error('Set a strong JWT_SECRET in server/.env');
const app=express();
const origins=(process.env.CORS_ORIGIN||'http://localhost:5173').split(',').map(x=>x.trim()).filter(Boolean);
app.disable('x-powered-by');
app.use(cors({origin:origins,credentials:false}));
app.use(express.json({limit:'256kb',type:['application/json','application/fhir+json']}));
app.use(express.text({limit:'256kb',type:['application/hl7-v2','text/hl7']}));
app.get('/health',(_req,res)=>res.json({ok:true,service:'DNA Pharmacy API'}));
app.use('/auth',authRoutes);
app.use('/api',apiRoutes);
app.use((e:any,_req:any,res:any,_next:any)=>{console.error(e);res.status(500).json({error:'Internal server error'});});
const port=Number(process.env.PORT||4000);
app.listen(port,()=>console.log(`DNA Pharmacy API listening on port ${port}`));
