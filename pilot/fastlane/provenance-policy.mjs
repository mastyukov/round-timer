/**
 * SYNTHETIC exact-SHA evidence-policy model. Does not call GitHub.
 * Caller must obtain authenticated results from GitHub Actions API.
 * RELEASE is NEVER automatically approved by cached results.
 */
const ranks=Object.freeze({fast:1,standard:2,critical:3,release:4});
const SHA40=/^[a-f0-9]{40}$/;
const SHA256=/^[a-f0-9]{64}$/;
export function mayReuseCiEvidence({requestedSha,repository,requiredLevel,testManifestSha,trustedWorkflowId,record}={}){
 if(requiredLevel==='release'||!(requiredLevel in ranks)||!record)return false;
 if(!SHA40.test(requestedSha??'')||!SHA256.test(testManifestSha??''))return false;
 if(!Number.isSafeInteger(trustedWorkflowId)||trustedWorkflowId<=0)return false;
 if(record.origin!=='authenticated-github-actions-api')return false;
 if(record.repository!==repository||record.head_sha!==requestedSha)return false;
 if(record.test_manifest_sha!==testManifestSha)return false;
 if(record.workflow_id!==trustedWorkflowId||!Number.isSafeInteger(record.run_id)||record.run_id<=0)return false;
 if(record.status!=='completed'||record.conclusion!=='success')return false;
 if(!(record.level in ranks))return false;
 return ranks[record.level]>=ranks[requiredLevel]&&ranks[record.level]<ranks.release;
}
