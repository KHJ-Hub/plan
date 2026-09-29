export type EducationGuideRecord = {
  courseName:string; subjectGroup:string; selectionType:string; credits:string; gradingMethod:string; csatRelation:string;
  courseNature:string; coreIdeas:string; contentStructure:string; knowledgeUnderstanding:string; processSkills:string; valuesAttitudes:string;
  hierarchy:string; relatedCareers:string; relatedDepartments:string; sourcePage:number; rawText:string; extractionStatus:'ok'|'needs_confirmation';
};

const clean=(value:string)=>value.replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').replace(/([가-힣A-Za-zⅠⅡ0-9])\1{2,}/g,'$1').replace(/(\S+)(?:\s+\1){2,}/g,'$1').trim();
const cleanLine=(value:string)=>clean(value).replace(/\s+([,.)])/g,'$1').trim();
const between=(text:string,start:string,end?:string)=>{const from=text.indexOf(start);if(from<0)return '';const body=text.slice(from+start.length);const to=end?body.indexOf(end):-1;return clean(to<0?body:body.slice(0,to));};

function dedupeTitleLine(value:string){
  const rawTokens=value.replace(/[\r\n]+/g,' ').split(/\s+/).filter(Boolean);
  const tokens=rawTokens.filter((token,index)=>index===0||token!==rawTokens[index-1]);
  for(let length=Math.floor(tokens.length/2);length>=1;length-=1){
    if(tokens.slice(0,length).join(' ')===tokens.slice(length,length*2).join(' '))return cleanLine([...tokens.slice(0,length),...tokens.slice(length*2)].join(' '));
  }
  return cleanLine(tokens.join(' '));
}

function selectionFrom(text:string){
  const group=String.raw`(?:국어|수학|영어|사회|과학|체육|예술|기술[･·]?\s*가정/?정보|제2외국어/?한문|교양)`;
  const four=text.match(new RegExp(`${group}\\s+([○-])\\s+([○-])\\s+([○-])\\s+([○-])`));
  if(four)return four[2]==='○'?'general':four[3]==='○'?'career':four[4]==='○'?'convergence':four[1]==='○'?'common':'';
  const schoolRow=text.match(new RegExp(`${group}\\s+(?:특수목적고|일반고)\\s+([○-])\\s+([○-])\\s+([○-])`));
  if(schoolRow)return schoolRow[1]==='○'?'general':schoolRow[2]==='○'?'career':schoolRow[3]==='○'?'convergence':'';
  return '';
}

function relatedFields(lines:string[]){
  const infoIndex=lines.findIndex(line=>line.includes('과목 관련 정보'));
  const departmentIndex=lines.findIndex((line,index)=>index>infoIndex&&line.includes('관련 학과'));
  if(infoIndex<0||departmentIndex<0)return {hierarchy:'',relatedCareers:'',relatedDepartments:''};
  const bodyLines=lines.slice(infoIndex+1,departmentIndex).filter(line=>!line.includes('관련 과목 및 위계 관련 직업'));
  const body=cleanLine(bodyLines.join(' '));
  const finalSentence=Math.max(body.lastIndexOf(' .'),body.lastIndexOf('.'));
  const hierarchy=finalSentence>=0?cleanLine(body.slice(0,finalSentence+1)):'';
  const relatedCareers=finalSentence>=0?cleanLine(body.slice(finalSentence+1)):'';
  const relatedDepartments=cleanLine(lines.slice(departmentIndex+1).join(' '));
  return {hierarchy,relatedCareers,relatedDepartments};
}

export function parseEducationGuidePage(rawText:string,page:number):EducationGuideRecord|null {
  // 개별 과목 첫 페이지에는 과목명 바로 다음 줄에 이 표 머리글이 있다. 이 조건으로
  // 내용 체계만 이어지는 후속 페이지를 과목 제목으로 잘못 인식하지 않는다.
  const lines=rawText.split(/\r?\n/).map(cleanLine).filter(Boolean);
  const tableIndex=lines.findIndex(line=>/교과\s*\(\s*군\s*\)\s*공통\s*과목/.test(line));
  if(tableIndex<1||!lines.some(line=>line.includes('선택 과목'))||!lines.some(line=>line.includes('과목 관련 정보')))return null;
  const courseName=dedupeTitleLine(lines[tableIndex-1]);
  if(!courseName||courseName.length>50||/공통\s*과목|선택\s*과목|과\s*목|^의\s/.test(courseName))return null;

  const text=clean(rawText);
  const subjectGroup=(lines[0]?.match(/^\d+\.\s*(국어|수학|영어|사회|과학|체육|예술|기술[･·]?\s*가정\/?정보|제2외국어\/?한문|교양)\s*교과/)||[])[1]?.replace(/\s+/g,' ')||'';
  const nature=clean((text.match(/성취도\s*\([^)]*\)(?:\s*석차등급\s*\([^)]*\))?(?:\s*(?:수능\s*(?:필수|선택|관련\s*없음)|미반영|-))?\s+([\s\S]*?)\s+성격\s+내용\s*체계/)||[])[1]||'');
  const related=relatedFields(lines);
  const selectionType=selectionFrom(text);
  const tableText=clean(lines.slice(tableIndex,Math.min(lines.length,tableIndex+8)).join(' '));
  const credits=(tableText.match(/\b[234](?:\s*±\s*[12])?\b/)||[])[0]?.replace(/\s/g,'')||'';
  const gradingMethod=clean((tableText.match(/성취도\s*\([^)]*\)(?:\s*석차등급\s*\([^)]*\))?/)||[])[0]||'');
  const csatRelation=text.includes('수능 필수')?'수능 필수':text.includes('수능 선택')?'수능 선택':text.includes('수능 관련 없음')?'수능 관련 없음':'';
  const record:EducationGuideRecord={
    courseName,subjectGroup,selectionType,credits,gradingMethod,csatRelation,courseNature:nature,
    coreIdeas:between(text,'핵심 아이디어','범주'),contentStructure:between(text,'내용 체계','핵심 아이디어'),
    knowledgeUnderstanding:between(text,'지식⋅이해','과정⋅기능'),processSkills:between(text,'과정⋅기능','가치⋅태도'),
    valuesAttitudes:between(text,'가치⋅태도','과목 관련 정보'),...related,sourcePage:page,rawText,
    extractionStatus:subjectGroup&&related.hierarchy&&related.relatedCareers&&related.relatedDepartments?'ok':'needs_confirmation',
  };
  return record;
}

export function parseEducationGuidePages(pages:Array<{pageNumber:number;text:string}>):EducationGuideRecord[]{
  const records:EducationGuideRecord[]=[];
  for(let index=0;index<pages.length;index+=1){
    const current=pages[index];
    if(!/교과\s*\(\s*군\s*\)\s*공통\s*과목/.test(current.text))continue;
    const combined=index+1<pages.length?`${current.text}\n${pages[index+1].text}`:current.text;
    const record=parseEducationGuidePage(current.text,current.pageNumber)||parseEducationGuidePage(combined,current.pageNumber);
    if(record&&!records.some(item=>item.courseName===record.courseName))records.push(record);
  }
  return records;
}

export const selectionLabel=(value:string)=>({common:'공통 과목',general:'일반 선택',career:'진로 선택',convergence:'융합 선택'}[value as 'general']||'확인 필요');
