import { SimplePage } from "@/components/simple-page";

export default function ExamplesPage() {
  return (
    <SimplePage
      badge="案例说明"
      title="让用户看到前后对比，价值会比讲概念更直接。"
      description="后续会补充更多真实岗位样例、行业模板和按角色筛选的内容，帮助你更快判断怎么改。"
      points={[
        "原句更像职责罗列，优化后需要补动作、结果、规模和影响。",
        "关键词不只是堆砌，要放在招聘方最关注的项目和技能位置。",
        "所有优化都应建立在真实经历上，不夸大、不虚构。",
      ]}
    />
  );
}
