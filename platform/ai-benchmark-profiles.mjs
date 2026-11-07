import {AI_OUTPUT_SCHEMAS,responseFormatFor} from '../marches/ai-output-schema.mjs';

/** Evaluation only: production modules never import these candidate profiles. */
export function benchmarkProfiles(captures){
 if(!Array.isArray(captures)||captures.some(c=>!c.input?.messages||!Number.isInteger(c.input.max_tokens)))throw Error('Capture production requests with prepare before exporting profiles.');
 const definitions=[
  {id:'production-json',model:null,structured:false},
  {id:'qwen38-json',model:'@cf/qwen/qwen3.8-27b',structured:false},
  {id:'gemma4-json',model:'@cf/google/gemma-4-26b-a4b-it',structured:false},
  {id:'qwen38-schema',model:'@cf/qwen/qwen3.8-27b',structured:true},
  {id:'gemma4-schema',model:'@cf/google/gemma-4-26b-a4b-it',structured:true}
 ];
 const profiles=definitions.map(profile=>({...profile,requests:captures.map(capture=>{
  const input=structuredClone(capture.input);
  if(profile.model){
   input.max_completion_tokens=input.max_tokens;delete input.max_tokens;
   input.chat_template_kwargs={...input.chat_template_kwargs,enable_thinking:false};
  }
  if(profile.structured)input.response_format=responseFormatFor(capture.task);
  const {messages,...parameters}=input;
  return {caseId:capture.id,task:capture.task,model:profile.model||capture.model,input,parameters};
 })}));
 return {schemaVersion:1,synthetic:true,evaluationOnly:true,schemas:structuredClone(AI_OUTPUT_SCHEMAS),profiles};
}
