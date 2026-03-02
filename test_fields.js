import('./src/Inhire/CustomDataManager/customDataManager.service.js').then(async (module) => {
    const fieldsJobs = await module.getCustomFieldsForEntity('JOBS');
    console.log('JOBS entity:', fieldsJobs?.length);
    const fieldsJob = await module.getCustomFieldsForEntity('JOB');
    console.log('JOB entity:', fieldsJob?.length);
    const fieldsVaga = await module.getCustomFieldsForEntity('VAGA');
    console.log('VAGA entity:', fieldsVaga?.length);
    
    if (fieldsJob?.length) {
        console.log("Sample JOB fields:", fieldsJob.map(f => ({ name: f.name, type: f.type })));
    }
}).catch(console.error);
