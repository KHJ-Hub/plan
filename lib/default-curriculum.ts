export type CurriculumCourse = { targetGrade: number; targetSemester: number; area: string; courseName: string; selectionType: 'general' | 'career' | 'convergence' };

const bySemester: Record<string, Array<[string, string, CurriculumCourse['selectionType']]>> = {
  '2-1': [
    ['체육','스포츠 생활2','convergence'],['예술','미술 창작','career'],['제2외국어','일본어I / 중국어I','general'],['국어','문학','general'],['수학','대수','general'],['수학','미적분 I','general'],['영어','영어 I','general'],['사회','사회와 문화','general'],['사회','세계시민과 지리','convergence'],['과학','물리학I','general'],['과학','생명과학I','general'],['국어','매체 의사소통','convergence'],['영어','영미 문학 읽기','career'],['영어','세계 문화와 영어','convergence'],['사회','사회문제 탐구','convergence'],['과학','과학의 역사와 문화','convergence'],['과학','기후변화와 환경생태','convergence'],
  ],
  '2-2': [
    ['체육','스포츠 생활1','convergence'],['예술','음악 연주와 창작','career'],['정보','정보','general'],['국어','독서와 작문','general'],['수학','확률과 통계','general'],['영어','영어 II','general'],['사회','세계사','general'],['사회','현대 사회와 윤리','general'],['과학','화학I','general'],['과학','지구과학I','general'],['국어','문학과 영상','career'],['수학','미적분 II','general'],['영어','영어 발표와 토론','career'],['영어','미디어 영어','convergence'],['사회','정치','career'],['사회','경제','career'],['사회','여행 지리','career'],
  ],
  '3-1': [
    ['체육','스포츠 문화','career'],['국어','화법과 언어','general'],['국어','주제 탐구 독서','career'],['국어','문학과 영상','career'],['수학','기하','career'],['수학','경제 수학','career'],['수학','수학 과제 탐구','convergence'],['영어','영어 독해와 작문','general'],['영어','영어 발표와 토론','career'],['영어','미디어 영어','convergence'],['사회','한국지리 탐구','career'],['사회','법과 사회','career'],['사회','윤리와 사상','career'],['사회','금융과 경제생활','convergence'],['과학','역학과 에너지','career'],['과학','전자기와 양자','career'],['과학','물질과 에너지','career'],['과학','화학 반응의 세계','career'],['과학','세포와 물질 대사','career'],['과학','생물의 유전','career'],['과학','지구시스템과학','career'],['과학','행성우주과학','career'],['과학','융합과학 탐구','convergence'],['제2외국어','심화 일본어','career'],['기술·가정','인공지능 기초','convergence'],
  ],
  '3-2': [
    ['체육','스포츠 과학','career'],['교양','생태와 환경','general'],['교양','인간과 심리','career'],['국어','주제 탐구 독서','career'],['국어','독서 토론과 글쓰기','convergence'],['국어','언어 생활 탐구','convergence'],['수학','인공 지능 수학','career'],['수학','고급 미적분','career'],['영어','영미 문학 읽기','career'],['영어','심화 영어','career'],['영어','세계 문화와 영어','convergence'],['사회','국제 관계의 이해','career'],['사회','윤리문제 탐구','convergence'],['과학','물리학 탐구','convergence'],['과학','생명과학 탐구','convergence'],['과학','융합과학 탐구','convergence'],['제2외국어','일본어 회화','general'],['기술·가정','소프트웨어와 생활','convergence'],
  ],
};

export const defaultCurriculum: CurriculumCourse[] = Object.entries(bySemester).flatMap(([key, rows]) => {
  const [targetGrade, targetSemester] = key.split('-').map(Number);
  return rows.map(([area, courseName, selectionType]) => ({ targetGrade, targetSemester, area, courseName, selectionType }));
});
