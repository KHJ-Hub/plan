import { getDatabase } from '@/db';
import { id, json, now, requireSession } from '@/lib/server';

type Row=Record<string, unknown>;
const text=(row:Row,key:string)=>String(row[key]??'').trim();

export async function POST(request:Request){
  const session=await requireSession(request,'admin'); const body=await request.json() as {action:'preview'|'commit';criteriaYear:number;fileName:string;rows:Row[];replaceUploadIds?:string[]};
  if(!Number.isInteger(Number(body.criteriaYear))||!body.fileName||!Array.isArray(body.rows))return json({error:'기준학년도, PDF 파일, 분석 결과를 확인해주세요.'},{status:400});
  const rows=body.rows.filter(row=>text(row,'courseName')&&Number(row.sourcePage)>0); const failed=body.rows.length-rows.length; const db=getDatabase();
  const existing=await db.prepare('SELECT id,file_name,row_count FROM reference_uploads WHERE reference_type=? AND criteria_year=? AND active=1').bind('education_official',Number(body.criteriaYear)).all();
  const summary={pageCount:Number(body.rows[0]?.pageCount)||0,courseCount:rows.length,confirmed:rows.filter(r=>text(r,'extractionStatus')==='ok').length,needsConfirmation:rows.filter(r=>text(r,'extractionStatus')!=='ok').length,excludedPages:Number(body.rows[0]?.excludedPages)||0,sample:rows.slice(0,10)};
  if(body.action==='preview')return json({summary,existing:existing.results||[]});
  if(!rows.length)return json({error:'저장할 과목 설명을 찾지 못했습니다.'},{status:400});
  const active=(existing.results||[]) as Array<{id:string}>; const replacements=new Set(body.replaceUploadIds||[]); if(active.some(item=>!replacements.has(item.id)))return json({error:'같은 기준학년도의 교육청 공식 과목 안내가 이미 있습니다. 교체 여부를 확인해주세요.',conflicts:active.map(x=>x.id)},{status:409});
  const timestamp=now(), uploadId=id('education_pdf'); const statements:D1PreparedStatement[]=[];
  active.forEach(item=>statements.push(db.prepare('UPDATE reference_uploads SET active=0 WHERE id=?').bind(item.id)));
  statements.push(db.prepare('INSERT INTO reference_uploads(id,reference_type,criteria_year,file_name,uploaded_by,row_count,failed_count,active,replaced_upload_id,summary_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(uploadId,'education_official',Number(body.criteriaYear),body.fileName,session.actor,rows.length,failed,1,active[0]?.id||null,JSON.stringify(summary),timestamp));
  for(const row of rows) statements.push(db.prepare('INSERT INTO education_office_course_guides(id,upload_id,criteria_year,course_name,subject_group,selection_type,credits,grading_method,csat_relation,course_nature,core_ideas,content_structure,knowledge_understanding,process_skills,values_attitudes,hierarchy,related_careers,related_departments,source_page,source_document,issuing_organization,curriculum_name,extraction_status,raw_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id('edu_course'),uploadId,Number(body.criteriaYear),text(row,'courseName'),text(row,'subjectGroup'),text(row,'selectionType'),text(row,'credits'),text(row,'gradingMethod'),text(row,'csatRelation'),text(row,'courseNature'),text(row,'coreIdeas'),text(row,'contentStructure'),text(row,'knowledgeUnderstanding'),text(row,'processSkills'),text(row,'valuesAttitudes'),text(row,'hierarchy'),text(row,'relatedCareers'),text(row,'relatedDepartments'),Number(row.sourcePage),body.fileName,'부산광역시교육청','2022 개정 교육과정',text(row,'extractionStatus'),text(row,'rawText'),timestamp));
  statements.push(db.prepare('INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)').bind(id('audit'),session.actor,'교육청 공식 과목 안내 PDF 업로드',JSON.stringify({fileName:body.fileName,count:rows.length}),timestamp)); await db.batch(statements); return json({ok:true,savedCount:rows.length});
}
