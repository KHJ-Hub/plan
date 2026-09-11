import type { SchoolBookRow } from './school-book-hwpx';

type TextItem={str?:string;transform?:number[]};
type Positioned={text:string;x:number;y:number};
const clean=(value:string)=>value.replace(/[\r\n]+/g,' ').replace(/\s+/g,' ').trim();
const key=(value:string)=>clean(value).replace(/[·ㆍ]/g,'').replace(/\s/g,'').toLowerCase();
const aliases:Record<string,string[]>={subjectName:['과목명','교과목','과목'],subjectGroup:['교과군','교과','영역'],curriculumCategory:['교육과정분류','과목분류','선택과목분류'],schoolRequirement:['학교운영','필수선택','필수여부'],targetGrade:['대상학년','이수학년','신청대상학년'],targetSemester:['대상학기','이수학기','학기'],selectionGroup:['선택군','과목군'],selectionCount:['선택가능개수','선택개수'],credit:['학점','이수단위','단위'],timing:['이수시기','개설시기'],selectionConditions:['선택조건','선택안내'],concurrentLimit:['동시선택제한','선택제한'],prerequisite:['선수과목','선이수'],subsequent:['후속과목','후속']};
const category=(value:string)=>/공통/.test(value)?'common':/진로/.test(value)?'career':/융합/.test(value)?'convergence':/일반/.test(value)?'general':'';
const indexFor=(headers:string[],name:string)=>headers.findIndex(header=>aliases[name].some(alias=>key(header).includes(key(alias))));
const fieldValue=(cells:string[],index:number)=>index<0?'':clean(cells[index]||'');

function linesFrom(items:TextItem[]){
 const positioned:Positioned[]=items.map(item=>({text:clean(item.str||''),x:Number(item.transform?.[4]||0),y:Number(item.transform?.[5]||0)})).filter(item=>item.text);
 const buckets:{y:number;items:Positioned[]}[]=[];
 for(const item of positioned.sort((a,b)=>b.y-a.y||a.x-b.x)){const bucket=buckets.find(row=>Math.abs(row.y-item.y)<3);if(bucket)bucket.items.push(item);else buckets.push({y:item.y,items:[item]});}
 return buckets.map(bucket=>({y:bucket.y,cells:bucket.items.sort((a,b)=>a.x-b.x).map(item=>({text:item.text,x:item.x})),text:bucket.items.sort((a,b)=>a.x-b.x).map(item=>item.text).join(' ')}));
}
function rowFromValues(values:string[],headers:string[],page:number,ordinal:number):SchoolBookRow|null{
 const courseIndex=indexFor(headers,'subjectName');const subjectName=fieldValue(values,courseIndex);if(!subjectName||/^(합계|계|비고|구분|선택s*안내)$/.test(subjectName)||subjectName.length>60)return null;
 const indexes=Object.fromEntries(Object.keys(aliases).map(name=>[name,indexFor(headers,name)])); const rawCategory=fieldValue(values,indexes.curriculumCategory); const rawRequirement=fieldValue(values,indexes.schoolRequirement);
 return {subjectName,subjectGroup:fieldValue(values,indexes.subjectGroup),curriculumCategory:category(rawCategory)||rawCategory,schoolRequirement:/필수/.test(rawRequirement)?'required':'optional',targetGrade:fieldValue(values,indexes.targetGrade),targetSemester:fieldValue(values,indexes.targetSemester),selectionGroup:fieldValue(values,indexes.selectionGroup),selectionCount:fieldValue(values,indexes.selectionCount),credit:fieldValue(values,indexes.credit),timing:fieldValue(values,indexes.timing),selectionConditions:fieldValue(values,indexes.selectionConditions),concurrentLimit:fieldValue(values,indexes.concurrentLimit),prerequisite:fieldValue(values,indexes.prerequisite),subsequent:fieldValue(values,indexes.subsequent),sourceLocation:`PDF ${page}쪽 · 표 ${ordinal}`,adminNote:'',csatPriority:false,humanitiesPriority:false,sciencePriority:false};
}

/** 학교 책자 PDF의 텍스트 좌표를 표 행으로 바꾼다. 헤더를 찾지 못한 페이지는 저장 후보를 만들지 않는다. */
export function parseSchoolBookPdfPage(items:TextItem[],page:number){
 const lines=linesFrom(items);const rows:SchoolBookRow[]=[];let tables=0;let foundHeader=false;
 for(let lineIndex=0;lineIndex<lines.length;lineIndex+=1){
  const line=lines[lineIndex];const headers=line.cells.map(cell=>cell.text);const courseIndex=indexFor(headers,'subjectName');if(courseIndex<0)continue;
  foundHeader=true;tables+=1;const headerXs=line.cells.map(cell=>cell.x);
  for(let dataIndex=lineIndex+1;dataIndex<Math.min(lines.length,lineIndex+80);dataIndex+=1){
   const data=lines[dataIndex];if(!data.text||/^(?:표|※|주\)|[0-9]+\s*쪽)/.test(data.text))break;if(indexFor(data.cells.map(cell=>cell.text),'subjectName')>=0)break;
   const values=headers.map((_,columnIndex)=>{const start=headerXs[columnIndex]-(columnIndex?0:12);const end=columnIndex<headerXs.length-1?(headerXs[columnIndex]+headerXs[columnIndex+1])/2:Infinity;return clean(data.cells.filter(cell=>cell.x>=start&&cell.x<end).map(cell=>cell.text).join(' '));});
   const row=rowFromValues(values,headers,page,tables);if(row)rows.push(row);
  }
 }
 // 표가 아닌 "과목명: ..." 같은 명확한 문단은 과목명만 후보로 남기고, 나머지는 관리자가 채운다.
 if(!foundHeader){for(const line of lines){const matched=line.text.match(/(?:과목명|교과목)\s*[:：]\s*([^|·]{1,50})/);if(!matched)continue;const subjectName=clean(matched[1]);if(subjectName)rows.push({subjectName,subjectGroup:'',curriculumCategory:'',schoolRequirement:'optional',targetGrade:'',targetSemester:'',selectionGroup:'',selectionCount:'',credit:'',timing:'',selectionConditions:'',concurrentLimit:'',prerequisite:'',subsequent:'',sourceLocation:`PDF ${page}쪽 · 문단`,adminNote:'',csatPriority:false,humanitiesPriority:false,sciencePriority:false});}}
 return {rows,summary:{lineCount:lines.length,tableCount:tables,foundHeader}};
}
