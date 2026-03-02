
import { DataTypes } from 'sequelize';

export default (sequelize) => {
    const LinkedInProfile = sequelize.define('LinkedInProfile', {
        linkedinHandle: {
            type: DataTypes.STRING,
            primaryKey: true,
            allowNull: false,
            unique: true,
            comment: "O identificador único do perfil (slug da URL)"
        },
        fullProfileText: {
            type: DataTypes.TEXT,
            allowNull: false,
            comment: "O texto bruto extraído do PDF do perfil"
        },
        lastUpdated: {
            type: DataTypes.DATE,
            defaultValue: DataTypes.NOW,
            allowNull: false
        }
    }, {
        tableName: 'linkedin_profiles',
        timestamps: true, // Adds createdAt and updatedAt automatically
    });

    return LinkedInProfile;
};
