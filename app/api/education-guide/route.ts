import { getDatabase, getRuntimeEnv } from '@/db';
import { normalizeEducationGuideRows } from '@/lib/education-guide-import.mjs';
import { downloadPublicPdf, PublicPdfError } from '@/lib/public-pdf.mjs';
import { id, json, now, requireSession } from '@/lib/server';

type Row=Record<string, unknown>;
export async function GET(request:Request){
  await requireSession(request,'admin');
  const sourceUrl=new URL(request.url).searchParams.get('url')||'';
  try{
    const allowedHosts=String(getRuntimeEnv().PUBLIC_PDF_ALLOWED_HOSTS||'').split(',').map(host=>host.trim()).filter(Boolean);
    const result=await downloadPublicPdf(sourceUrl,globalThis.fetch,{allowedHosts});
    return new Response(result.bytes,{status:200,headers:{'Content-Type':'application/pdf','Content-Length':String(result.bytes.length),'Content-Disposition':'attachment; filename="public-course-guide.pdf"','X-Pdf-Filename':encodeURIComponent(result.fileName),'Cache-Control':'no-store'}});
  }catch(error){
    if(error instanceof PublicPdfError)return json({error:error.message},{status:error.status});
    console.error('공개 교육청 PDF 가져오기 실패',error);
    return json({error:'공개 PDF를 가져오는 중 문제가 발생했습니다.'},{status:502});
  }
}

export async function POST(request:Request){
  const session=await requireSession(request,'admin'); const body=await request.json() as {action:'preview'|'commit';criteriaYear:number;fileName:string;rows:Row[];replaceUploadIds?:string[]};
  const criteriaYear=Number(body.criteriaYear); const fileName=String(body.fileName||'').trim().slice(0,200);
  if(!Number.isInteger(criteriaYear)||criteriaYear<2000||criteriaYear>2200||!fileName||!Array.isArray(body.rows))return json({error:'기준학년도, PDF 파일, 분석 결과를 확인해주세요.'},{status:400});
  const normalized=normalizeEducationGuideRows(body.rows); const {rows,invalidRows,duplicateCourseNames}=normalized; const failed=invalidRows.length; const db=getDatabase();
  const existing=await db.prepare('SELECT id,file_name,row_count FROM reference_uploads WHERE reference_type=? AND criteria_year=? AND active=1').bind('education_official',criteriaYear).all();
  const summary={pageCount:Number(body.rows[0]?.pageCount)||0,courseCount:rows.length,confirmed:rows.filter(row=>row.extractionStatus==='ok').length,needsConfirmation:rows.filter(row=>row.extractionStatus!=='ok').length,excludedPages:Number(body.rows[0]?.excludedPages)||0,invalidCount:failed,duplicateCount:duplicateCourseNames.length,sample:rows.slice(0,10)};
  if(body.action==='preview')return json({summary,existing:existing.results||[],duplicateCourseNames,invalidRows});
  if(invalidRows.length)return json({error:'저장할 수 없는 과목 행이 있습니다. 과목명과 원본 페이지를 확인해주세요.',invalidRows},{status:400});
  if(!rows.length)return json({error:'저장할 과목 설명을 찾지 못했습니다.'},{status:400});
  if(duplicateCourseNames.length)return json({error:`같은 과목명이 중복되어 있습니다: ${duplicateCourseNames.join(', ')}`},{status:400});
  const active=(existing.results||[]) as Array<{id:string}>; const replacements=new Set(body.replaceUploadIds||[]); if(active.some(item=>!replacements.has(item.id)))return json({error:'같은 기준학년도의 교육청 공식 과목 안내가 이미 있습니다. 교체 여부를 확인해주세요.',conflicts:active.map(item=>item.id)},{status:409});
  const timestamp=now(), uploadId=id('education_pdf'); const statements:D1PreparedStatement[]=[];
  active.forEach(item=>statements.push(db.prepare('UPDATE reference_uploads SET active=0 WHERE id=?').bind(item.id)));
  statements.push(db.prepare('INSERT INTO reference_uploads(id,reference_type,criteria_year,file_name,uploaded_by,row_count,failed_count,active,replaced_upload_id,summary_json,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').bind(uploadId,'education_official',criteriaYear,fileName,session.actor,rows.length,failed,1,active[0]?.id||null,JSON.stringify(summary),timestamp));
  for(const row of rows)statements.push(db.prepare('INSERT INTO education_office_course_guides(id,upload_id,criteria_year,course_name,subject_group,selection_type,credits,grading_method,csat_relation,course_nature,core_ideas,content_structure,knowledge_understanding,process_skills,values_attitudes,hierarchy,related_careers,related_departments,source_page,source_document,issuing_organization,curriculum_name,extraction_status,raw_text,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').bind(id('edu_course'),uploadId,criteriaYear,row.courseName,row.subjectGroup,row.selectionType,row.credits,row.gradingMethod,row.csatRelation,row.courseNature,row.coreIdeas,row.contentStructure,row.knowledgeUnderstanding,row.processSkills,row.valuesAttitudes,row.hierarchy,row.relatedCareers,row.relatedDepartments,Number(row.sourcePage),fileName,'부산광역시교육청','2022 개정 교육과정',row.extractionStatus,row.rawText,timestamp));
  statements.push(db.prepare('INSERT INTO audit_logs(id,actor,action,details_json,created_at) VALUES(?,?,?,?,?)').bind(id('audit'),session.actor,'교육청 공식 과목 안내 PDF 업로드',JSON.stringify({fileName,count:rows.length,publishedCount:summary.confirmed,confirmationCount:summary.needsConfirmation}),timestamp));
  try{await db.batch(statements);return json({ok:true,savedCount:rows.length,publishedCount:summary.confirmed,confirmationCount:summary.needsConfirmation});}
  catch(error){console.error('교육청 공식 과목 안내 저장 실패',error);return json({error:'과목 안내 저장에 실패하여 기존 적용 자료는 유지됩니다.'},{status:500});}
}
