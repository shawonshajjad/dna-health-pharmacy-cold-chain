import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
const prisma=new PrismaClient();
const base=process.env.FHIR_BASE_URL||'https://hapi.fhir.org/baseR4';
const headers={'Content-Type':'application/fhir+json',Accept:'application/fhir+json'};
async function json(r:Response,label:string){if(!r.ok)throw new Error(`${label} failed: ${r.status} ${await r.text()}`);return r.json() as Promise<any>}
async function create(resource:any){return json(await fetch(`${base}/${resource.resourceType}`,{method:'POST',headers,body:JSON.stringify(resource)}),`${resource.resourceType} create`)}
async function findPatient(mrn:string){const u=new URL(`${base}/Patient`);u.searchParams.set('identifier',`https://dna-health.example/mrn|${mrn}`);u.searchParams.set('_count','10');const b:any=await json(await fetch(u,{headers:{Accept:'application/fhir+json'}}),'FHIR Patient search');return (b.entry||[]).map((e:any)=>e.resource).find((x:any)=>x?.resourceType==='Patient'&&x?.id)||null}
async function findMedication(patientId:string,rxcui:string){const u=new URL(`${base}/MedicationRequest`);u.searchParams.set('patient',patientId);u.searchParams.set('code',rxcui);u.searchParams.set('status','active');u.searchParams.set('_sort','-_lastUpdated');u.searchParams.set('_count','10');const b:any=await json(await fetch(u,{headers:{Accept:'application/fhir+json'}}),'FHIR MedicationRequest search');return (b.entry||[]).map((e:any)=>e.resource).find((x:any)=>x?.resourceType==='MedicationRequest'&&x?.id)||null}
try{
 const local=await prisma.patient.findUnique({where:{mrn:'P-4582'}});if(!local)throw new Error('Run npm run db:seed first');
 let patient=await findPatient(local.mrn);
 if(patient) console.log(`Existing FHIR Patient found: ${patient.id}`);
 else {patient=await create({resourceType:'Patient',identifier:[{system:'https://dna-health.example/mrn',value:local.mrn}],name:[{use:'official',family:'Demo',given:['Patient']}],active:true});console.log(`FHIR Patient created: ${patient.id}`)}
 await prisma.patient.update({where:{id:local.id},data:{fhirPatientId:String(patient.id)}});
 const rxcui='1807513';
 let medicationRequest=await findMedication(String(patient.id),rxcui);
 if(medicationRequest) console.log(`Existing MedicationRequest found: ${medicationRequest.id}`);
 else {medicationRequest=await create({resourceType:'MedicationRequest',status:'active',intent:'order',medicationCodeableConcept:{coding:[{system:'http://www.nlm.nih.gov/research/umls/rxnorm',code:rxcui,display:'vancomycin 1000 MG Injection'}],text:'Vancomycin 1 g Injection'},subject:{reference:`Patient/${patient.id}`},authoredOn:new Date().toISOString(),dosageInstruction:[{text:'1 g IV every 12 hours',timing:{repeat:{frequency:1,period:12,periodUnit:'h'}},route:{text:'IV'},doseAndRate:[{doseQuantity:{value:1,unit:'g',system:'http://unitsofmeasure.org',code:'g'}}]}]});console.log(`MedicationRequest created: ${medicationRequest.id}`)}
 console.log('\nLive HAPI FHIR provisioning successful.');console.log(`FHIR Patient: ${patient.id}`);console.log(`FHIR MedicationRequest: ${medicationRequest.id}`);console.log(`RxNorm RxCUI: ${rxcui}`);console.log('Medication: Vancomycin 1000 MG Injection');console.log('Dose: 1 g IV every 12 hours\n');
}finally{await prisma.$disconnect()}
