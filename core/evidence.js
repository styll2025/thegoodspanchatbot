// Approved statements the AI-written report may draw on, beyond the practice library.
// Each statement says what a recognised source recommends, in plain words, with who it applies to and when it must
// not be used. The report may cite a statement only when it applies to this person; the page checks this.
//
// STATUS: DRAFT. Written from the published sources below; every statement needs review and sign-off by a qualified
// professional before members see it. Do not add a statement without a source, and keep the wording close to it.
(function (root) {
  const SOURCES = {
    who_pa: { title: 'WHO guidelines on physical activity and sedentary behaviour', org: 'World Health Organization', year: 2020, cite: 'Bull et al., Br J Sports Med 2020', pmid: '33239350' },
    who_diet: { title: 'Healthy diet: fact sheet', org: 'World Health Organization', year: 2020, cite: 'WHO healthy diet guidance' },
    eat_lancet: { title: 'Food in the Anthropocene: the EAT-Lancet Commission on healthy diets from sustainable food systems', org: 'The Lancet', year: 2019, cite: 'Willett et al., Lancet 2019', pmid: '30660336' },
    aha_le8: { title: "Life's Essential 8", org: 'American Heart Association', year: 2022, cite: 'Lloyd-Jones et al., Circulation 2022', pmid: '35766027' },
    sleep_cons: { title: 'Recommended amount of sleep for a healthy adult', org: 'American Academy of Sleep Medicine and Sleep Research Society', year: 2015, cite: 'Watson et al., Sleep 2015', pmid: '26039963' },
    lancet_dem: { title: 'Dementia prevention, intervention, and care: 2024 report of the Lancet standing Commission', org: 'The Lancet', year: 2024, cite: 'Livingston et al., Lancet 2024', pmid: '39096926' },
    social_meta: { title: 'Social relationships and mortality risk: a meta-analytic review', org: 'PLoS Medicine', year: 2010, cite: 'Holt-Lunstad et al., PLoS Med 2010', pmid: '20668659' },
  };
  const age60 = p => ['60-69', '70 or over'].includes(p.age);
  const heldOrPregnant = p => !!(p.symptoms && !p.symptoms_cleared) || !!p.pregnant || !!p.breastfeeding;
  const CARDS = [
    { id: 'pa_aerobic', area: 'Movement', src: 'who_pa', text: 'Adults should do at least 150 to 300 minutes of moderate-intensity aerobic activity a week, or 75 to 150 minutes of vigorous activity, or a combination of both.', avoid: p => heldOrPregnant(p) || !!p.heart || !!p.lung },
    { id: 'pa_strength', area: 'Movement', src: 'who_pa', text: 'Adults should also do muscle-strengthening activities that work all major muscle groups on 2 or more days a week.', avoid: p => heldOrPregnant(p) || !!p.heart },
    { id: 'pa_sitting', area: 'Movement', src: 'who_pa', text: 'Adults should limit the time they spend sitting. Replacing sitting time with physical activity of any intensity, including light activity, has health benefits.', avoid: p => !!(p.symptoms && !p.symptoms_cleared) },
    { id: 'pa_some', area: 'Movement', src: 'who_pa', text: 'Doing some physical activity is better than doing none. People who are not meeting the recommendations can start with small amounts and gradually increase how often, how hard and how long they are active.', avoid: p => !!(p.symptoms && !p.symptoms_cleared) },
    { id: 'pa_older', area: 'Movement', src: 'who_pa', text: 'Older adults, from age 65, should include varied activity that emphasises balance and strength on 3 or more days a week, to improve functional capacity and help prevent falls.', applies: age60, avoid: heldOrPregnant },
    { id: 'diet_fv', area: 'Nutrition', src: 'who_diet', text: 'A healthy diet includes at least 400 g, or five portions, of fruit and vegetables a day.', avoid: p => !!p.food_rel },
    { id: 'diet_plants', area: 'Nutrition', src: 'who_diet', text: 'A healthy diet includes legumes such as lentils and beans, nuts and whole grains such as unprocessed maize, millet, oats, wheat and brown rice.', avoid: p => !!p.nut_allergy || !!p.food_rel },
    { id: 'diet_plants_na', area: 'Nutrition', src: 'who_diet', text: 'A healthy diet includes legumes such as lentils and beans and whole grains such as oats, wholewheat and brown rice.', avoid: p => !!p.food_rel },
    { id: 'diet_salt', area: 'Nutrition', src: 'who_diet', text: 'Keeping salt intake to less than 5 g a day, about one teaspoon, is recommended for adults.', avoid: p => !!p.food_rel || !!p.kidney },
    { id: 'diet_sugar', area: 'Nutrition', src: 'who_diet', text: 'Free sugars should make up less than 10% of daily energy intake, and less than 5% brings further benefits. Sugary drinks are a main source.', avoid: p => !!p.food_rel || !!p.diabetes_med },
    { id: 'diet_pattern', area: 'Nutrition', src: 'eat_lancet', text: 'A healthy diet is built mostly on plant foods: vegetables, fruit, whole grains, legumes and nuts, with low amounts of red and processed meat and of added sugar.', avoid: p => !!p.food_rel },
    { id: 'le8', area: 'General', src: 'aha_le8', text: "The American Heart Association's Life's Essential 8 are the everyday factors that support heart and brain health: eating well, being active, avoiding nicotine, healthy sleep, a healthy weight and healthy cholesterol, blood sugar and blood pressure." },
    { id: 'sleep_7', area: 'Sleep', src: 'sleep_cons', text: 'Adults should sleep 7 or more hours a night on a regular basis to support optimal health.' },
    { id: 'sleep_le8', area: 'Sleep', src: 'aha_le8', text: "Healthy sleep, 7 to 9 hours a night for adults, is one of the eight factors in Life's Essential 8." },
    { id: 'dem_factors', area: 'General', src: 'lancet_dem', text: 'The 2024 Lancet Commission identified 14 risk factors for dementia that people can influence over their lives: less education, hearing loss, high LDL cholesterol, depression, traumatic brain injury, physical inactivity, diabetes, smoking, high blood pressure, obesity, excessive alcohol, social isolation, air pollution and untreated loss of vision. It estimated that nearly half of dementia cases could in theory be prevented or delayed by addressing them.' },
    { id: 'dem_bp', area: 'Prevention', src: 'lancet_dem', text: 'The Commission recommends keeping blood pressure in a healthy range from midlife, from around age 40. Knowing your blood pressure through regular checks is the first step.' },
    { id: 'dem_hearing', area: 'Prevention', src: 'lancet_dem', text: 'Hearing loss is one of the risk factors the Commission identifies. It recommends hearing aids for people with hearing loss and protecting ears from excessive noise.' },
    { id: 'dem_vision', area: 'Prevention', src: 'lancet_dem', text: 'Untreated loss of vision is one of the risk factors the Commission identifies; it recommends screening for and treating vision loss.' },
    { id: 'dem_cognitive', area: 'Prevention', src: 'lancet_dem', text: 'The Commission recommends cognitively stimulating activities in midlife, such as learning, to support thinking skills later in life.' },
    { id: 'dem_social', area: 'Connection', src: 'lancet_dem', text: 'Social isolation is one of the risk factors the Commission identifies. Staying socially engaged across life is recommended.' },
    { id: 'dem_active', area: 'Movement', src: 'lancet_dem', text: 'Physical inactivity is one of the risk factors the Commission identifies; staying physically active through midlife and later life is recommended.' },
    { id: 'dem_smoking', area: 'Prevention', src: 'lancet_dem', text: 'Smoking is one of the risk factors the Commission identifies. Stopping smoking is beneficial at any age.' },
    { id: 'dem_alcohol', area: 'Prevention', src: 'lancet_dem', text: 'Excessive alcohol is one of the risk factors the Commission identifies; it recommends drinking less.', avoid: p => (p.audit || 0) >= 5 },
    { id: 'social_rel', area: 'Connection', src: 'social_meta', text: 'Across 148 studies, people with stronger social relationships were more likely to survive over the follow-up period than those with weaker social relationships.' },
  ];
  const usable = (c, p) => !(c.applies && !c.applies(p)) && !(c.avoid && c.avoid(p));
  // the statements this person's report may cite, with their source
  function forProfile(p) { return CARDS.filter(c => usable(c, p)).map(c => ({ id: c.id, area: c.area, text: c.text, source: SOURCES[c.src] })); }
  const api = { SOURCES, CARDS, forProfile, STATUS: 'draft' };
  if (typeof module !== 'undefined') module.exports = api; else root.GSEvidence = api;
})(this);
