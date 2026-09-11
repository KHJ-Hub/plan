export type EducationGuideRecord = {
  courseName:string; subjectGroup:string; selectionType:string; credits:string; gradingMethod:string; csatRelation:string;
  courseNature:string; coreIdeas:string; contentStructure:string; knowledgeUnderstanding:string; processSkills:string; valuesAttitudes:string;
  hierarchy:string; relatedCareers:string; relatedDepartments:string; sourcePage:number; rawText:string; extractionStatus:'ok'|'needs_confirmation';
};

const clean=(value:string)=>value.replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').replace(/([가-힣A-Za-zⅠⅡ0-9])\1{2,}/g,'$1').trim();
const between=(text:string,start:string,end?:string)=>{const from=text.indexOf(start);if(from<0)return '';const body=text.slice(from+start.length);const to=end?body.indexOf(end):-1;return clean(to<0?body:body.slice(0,to));};
const selection=(text:string)=>{
  const match=text.match(/(?:국어|수학|영어|사회|과학|체육|예술|기술[･·]가정\/?정보|제2외국어\/?한문|교양)\s+([○-])\s+([○-])\s+([○-])\s+([○-])/);
  if(!match)return '';
  return match[2]==='○'?'general':match[3]==='○'?'career':match[4]==='○'?'convergence':match[1]==='○'?'common':'';
};
const titleFrom=(text:string)=>{
  const head=text.split('선택 과목')[0]||'';
  return clean(head.replace(/^\s*\d+\.\s*[^\n]*교과\s*/,'').replace(/\s*교과\s*$/,'')).replace(/\s/g,' ');
};

export function parseEducationGuidePage(rawText:string,page:number):EducationGuideRecord|null {
  if(!rawText.includes('선택 과목') || !rawText.includes('과목 관련 정보')) return null;
  const courseName=titleFrom(rawText);
  if(!courseName || courseName.length>40 || /^(선택 과목|교과)/.test(courseName)) return null;
  const subjectGroup=(rawText.match(/\n(국어|수학|영어|사회|과학|체육|예술|기술[･·]가정\/?정보|제2외국어\/?한문|교양)\s+[-○]/)||[])[1]||'';
  const nature=between(rawText,'성격','내용 체계');
  const related=between(rawText,'과목 관련 정보');
  const hierarchy=between(related,'관련 과목 및 위계','관련 직업');
  const careers=between(related,'관련 직업','관련 학과');
  const departments=between(related,'관련 학과');
  const record:EducationGuideRecord={courseName,subjectGroup,selectionType:selection(rawText),credits:(rawText.match(/\b[234](?:±[12])?\b/)||[])[0]||'',gradingMethod:clean((rawText.match(/성취도\([^)]*\)(?:\s*석차등급\(○\))?/)||[])[0]||''),csatRelation:rawText.includes('수능 필수')?'수능 필수':(rawText.match(/수능 관련\s*\n?[\s\S]{0,70}/)||[])[0]?.includes('-')?'수능 관련 없음':'',courseNature:nature,coreIdeas:between(rawText,'핵심','범주'),contentStructure:between(rawText,'내용 체계','핵심'),knowledgeUnderstanding:between(rawText,'지식⋅이해','과정⋅기능'),processSkills:between(rawText,'과정⋅기능','가치⋅태도'),valuesAttitudes:between(rawText,'가치⋅태도','과목 관련 정보'),hierarchy,relatedCareers:careers,relatedDepartments:departments,sourcePage:page,rawText,extractionStatus:nature&&subjectGroup&&hierarchy?'ok':'needs_confirmation'};
  return record;
}

export const selectionLabel=(value:string)=>({common:'공통 과목',general:'일반 선택',career:'진로 선택',convergence:'융합 선택'}[value as 'general']||'확인 필요');
